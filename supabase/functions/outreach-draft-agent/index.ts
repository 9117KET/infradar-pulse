/**
 * outreach-draft-agent
 *
 * The "AI mines + drafts" half of the semi-autonomous outbound layer.
 * For each prospect due for their next sequence touch, it:
 *   1. Pulls real, source-linked proof from the live `projects` table for the
 *      prospect's region (project count + indexed value + 1-3 examples).
 *   2. Asks Lovable AI to write that touch in the InfraRadarAI voice, following
 *      the persona wedge + cadence in go-to-market/OUTBOUND-SEQUENCES.md.
 *   3. Writes an `outreach_messages` row with status='draft'.
 *
 * It NEVER sends. A human approves drafts in /dashboard/outreach; the send
 * agent only ever touches status='approved'. Sequence advancement happens at
 * send time (email) or "mark sent" (LinkedIn), not here — so re-runs are safe.
 *
 * Follows the standard agent pattern: requireStaff → isAgentEnabled →
 * beginAgentTask lock → work → finishAgentRun / failAgentTask.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import {
  isAgentEnabled,
  pausedResponse,
  beginAgentTask,
  alreadyRunningResponse,
  finishAgentRun,
  failAgentTask,
} from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// 5 touches across 14 days (OUTBOUND-SEQUENCES.md). LinkedIn first, email second.
const STEP_CHANNELS = ["linkedin", "email", "linkedin", "email", "email"] as const;
const STEP_PURPOSE = [
  "LinkedIn connect note (max ~300 chars). Open the door — lead with verification + the cross-MDB wedge.",
  "Value-led email. Land the wedge, anchor the price, ask for a 10-min walkthrough or offer a card-free trial link.",
  "LinkedIn DM. One specific, real proof point for their region/sector. Offer to send the region extract, no commitment.",
  "Short email asking for 10 minutes this week (Wed/Thu).",
  "Close-the-loop email. 'Should I close the file?' — leave the card-free trial / free tier open.",
] as const;
const MAX_STEP = 4;
const BATCH = 15;

// Persona wedge + goal, distilled from OUTBOUND-SEQUENCES.md + MESSAGING.md.
type PersonaCfg = { label: string; wedge: string; price: string; goal: "revenue" | "loi" };
const PERSONAS: Record<string, PersonaCfg> = {
  dfi_analyst: {
    label: "DFI / MDB analyst or Task Team Leader",
    wedge: "one verified, source-linked feed across all 7 MDBs (incl. their own) with confidence scoring and a human review queue",
    price: "Not a subscription pitch — free tier, or a Founders Lifetime as a personal tool. The ask is 10 min of their view and (if useful) a one-line written acknowledgement for our materials.",
    goal: "loi",
  },
  infra_pe: {
    label: "Emerging-markets infrastructure PE",
    wedge: "a verified pre-tender pipeline across all 7 MDBs, surfacing deals 6-18 months before they hit IJGlobal, with delay-risk, contractor-distress and co-financing signals attached",
    price: "$199/mo per origination seat replaces ~$30-50K of incumbent stack.",
    goal: "revenue",
  },
  epc_bd: {
    label: "EPC contractor business development",
    wedge: "MDB tenders 6-18 months before public RFP across 7 MDBs + 20+ procurement portals, with contractor intelligence (who else is bidding, recent awards, delay risk) on each project",
    price: "$199/mo per BD seat. Pilot one country team for a quarter — if they don't surface a winnable tender 60 days early, we refund.",
    goal: "revenue",
  },
  consultant: {
    label: "Strategy / infrastructure consultant",
    wedge: "an AI Market Report Builder that generates verified, source-linked country/sector reports across 7 MDBs in ~20 min vs the usual 2-week analyst cycle (every claim links to its source)",
    price: "$199/mo per seat, chargeable to the engagement.",
    goal: "revenue",
  },
  project_finance: {
    label: "Project finance / syndication banker",
    wedge: "cross-MDB pipeline visibility — all 7 MDBs + 20+ procurement portals + a co-financing graph in one ranked feed, useful 6-18 months before financial close",
    price: "$199/mo per origination seat to start, Enterprise (API + SSO) once the desk is on it.",
    goal: "revenue",
  },
};
const GENERIC: PersonaCfg = {
  label: "infrastructure decision-maker",
  wedge: "one verified, source-linked feed across all 7 MDBs + 20+ procurement portals, with confidence scoring on every record",
  price: "Free tier to start; $199/mo Pro for full research, exports and risk analytics.",
  goal: "revenue",
};

function personaCfg(p: string | null): PersonaCfg {
  return (p && PERSONAS[p]) || GENERIC;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function parseJsonLoose(content: string): { subject?: string; body?: string } | null {
  let s = content.trim();
  // Strip ```json fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // Last resort: grab the first {...} object
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = gate.supabaseAdmin ?? createClient(supabaseUrl, serviceKey);

  if (!(await isAgentEnabled(supabase, "outreach_draft"))) return pausedResponse("outreach_draft");

  const lock = await beginAgentTask(supabase, "outreach_draft", "Draft outbound sequence touches", gate.userId ?? undefined);
  if (lock.alreadyRunning) return alreadyRunningResponse("outreach_draft");
  const taskId = lock.taskId;
  const startedAt = new Date();

  let drafted = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Prospects still in-sequence with a touch left to draft.
    const { data: prospects, error: pErr } = await supabase
      .from("outreach_prospects")
      .select("id, name, org, role, email, persona, region, sector, next_step, status")
      .in("status", ["new", "sequencing"])
      .lte("next_step", MAX_STEP)
      .order("wave", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (pErr) throw pErr;

    for (const prospect of prospects ?? []) {
      const step = prospect.next_step ?? 0;
      const channel = STEP_CHANNELS[step] ?? "email";
      const cfg = personaCfg(prospect.persona);

      // Idempotency: never draft a touch that already has a pending/sent message.
      const { data: existing } = await supabase
        .from("outreach_messages")
        .select("id")
        .eq("prospect_id", prospect.id)
        .eq("step", step)
        .in("status", ["draft", "approved", "scheduled", "sent"])
        .limit(1);
      if (existing && existing.length > 0) {
        skipped += 1;
        continue;
      }

      // Email touches need a real address; LinkedIn touches do not.
      if (channel === "email" && !prospect.email) {
        skipped += 1;
        continue;
      }

      // --- Real proof from the live projects table for this prospect's region ---
      let regionCount = 0;
      let regionValue = 0;
      let examples: Array<Record<string, unknown>> = [];
      if (prospect.region) {
        const { data: rows, error: rErr } = await supabase
          .from("projects")
          .select("name, country, value_label, value_usd, stage, sector")
          .eq("approved", true)
          .eq("region", prospect.region)
          .order("value_usd", { ascending: false })
          .limit(200);
        if (!rErr && rows && rows.length) {
          regionCount = rows.length;
          regionValue = rows.reduce((s, r) => s + Number(r.value_usd || 0), 0);
          examples = rows.slice(0, 3);
        }
      }
      if (examples.length === 0) {
        // Fall back to top global projects so every draft has a concrete proof point.
        const { data: rows } = await supabase
          .from("projects")
          .select("name, country, value_label, value_usd, stage, sector")
          .eq("approved", true)
          .order("value_usd", { ascending: false })
          .limit(3);
        examples = rows ?? [];
      }

      const facts = [
        `Persona: ${cfg.label}.`,
        `Wedge for them: ${cfg.wedge}.`,
        `Pricing / ask: ${cfg.price}`,
        prospect.org ? `Their organisation: ${prospect.org}.` : "",
        prospect.role ? `Their role: ${prospect.role}.` : "",
        prospect.region ? `Their region of focus: ${prospect.region}.` : "",
        prospect.sector ? `Their sector of focus: ${prospect.sector}.` : "",
        regionCount > 0
          ? `Live proof — InfraRadar currently indexes ${regionCount} verified projects worth ${fmtUsd(regionValue)} in ${prospect.region}.`
          : "",
        `Platform headline (true): ~1,600 verified projects across 140 countries, $246B+ pipeline indexed, all 7 MDBs (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IADB) + 20+ procurement portals.`,
        examples.length
          ? `Example real projects to optionally cite: ${examples
              .map((e) => `${e.name} (${e.country}, ${e.value_label}, ${e.stage}, ${e.sector})`)
              .join("; ")}.`
          : "",
      ].filter(Boolean).join("\n");

      const firstName = (prospect.name || "").trim().split(/\s+/)[0] || "there";

      const system =
        "You are the founder of InfraRadarAI writing concise, high-trust B2B outreach. " +
        "Voice: direct, specific, no hype. Never use the words 'revolutionize', 'leverage', 'synergy', 'cutting-edge'. " +
        "Lead with verification ('every claim is source-linked'), not a feature list. Only cite numbers given to you as facts — never invent figures, project names or values. " +
        "Sign off as the founder. Keep it short.";

      const user =
        `Write touch #${step + 1} of a 5-touch sequence.\n` +
        `Channel: ${channel === "linkedin" ? "LinkedIn (no subject; <= 300 characters; plain text)" : "Email (include a short subject line)"}.\n` +
        `Purpose: ${STEP_PURPOSE[step]}\n\n` +
        `Recipient first name: ${firstName}\n\n` +
        `FACTS (use only these; do not fabricate):\n${facts}\n\n` +
        (cfg.goal === "loi"
          ? "This persona is for credibility/LOI, NOT a sale. Do not push a subscription; ask for their view and a possible one-line acknowledgement.\n\n"
          : "") +
        `Respond with ONLY a JSON object: {"subject": string, "body": string}. ` +
        `For LinkedIn touches set "subject" to an empty string.`;

      let subject: string | null = null;
      let body: string | null = null;
      let model = "unknown";
      try {
        const resp = await chatCompletions({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.6,
        });
        if (!resp.ok) {
          errors += 1;
          console.error("[outreach-draft] LLM error", { status: resp.status, body: await resp.text() });
          continue;
        }
        const json = await resp.json();
        model = json.model ?? "lovable-ai";
        const content: string = json.choices?.[0]?.message?.content ?? "";
        const parsed = parseJsonLoose(content);
        if (!parsed || !parsed.body) {
          errors += 1;
          console.error("[outreach-draft] unparseable LLM output", { content: content.slice(0, 400) });
          continue;
        }
        subject = channel === "linkedin" ? null : (parsed.subject || "").trim() || null;
        body = parsed.body.trim();
      } catch (e) {
        errors += 1;
        console.error("[outreach-draft] LLM exception", e);
        continue;
      }

      const { error: insErr } = await supabase.from("outreach_messages").insert({
        prospect_id: prospect.id,
        channel,
        step,
        status: "draft",
        subject,
        body,
        generated_by: model,
      });
      if (insErr) {
        errors += 1;
        console.error("[outreach-draft] insert error", insErr);
        continue;
      }

      // Mark the prospect as actively in-sequence (does not advance the step;
      // that happens when this touch is actually sent / marked sent).
      if (prospect.status === "new") {
        await supabase.from("outreach_prospects").update({ status: "sequencing" }).eq("id", prospect.id);
      }
      drafted += 1;
    }

    await finishAgentRun(supabase, "outreach_draft", "completed", startedAt);
    console.log("[outreach-draft] done", { drafted, skipped, errors });
    return new Response(JSON.stringify({ success: true, drafted, skipped, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await failAgentTask(supabase, "outreach_draft", taskId, startedAt, e);
    console.error("[outreach-draft] fatal", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
