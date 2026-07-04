/**
 * weekly-signal-agent
 *
 * The inbound flywheel. Curates 3 real, source-linked projects from the live
 * index and emails them to newsletter subscribers as the "Weekly Infrastructure
 * Signal" → signup CTA. Pure data + existing email infra, so it always runs
 * without external AI credits.
 *
 * Follows the standard agent pattern. Suppression/unsubscribe is handled inside
 * send-transactional-email, so this agent just enqueues.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const RECIPIENT_CAP = 1000;
const EARLY_STAGES = new Set(["Planned", "Announced", "Proposed", "Pre-Feasibility", "Feasibility"]);

function whyLine(stage: string | null, confidence: number | null): string {
  if (stage && EARLY_STAGES.has(stage)) {
    return "Early-stage — typically surfaced 6-18 months before it reaches public tender.";
  }
  if (typeof confidence === "number" && confidence >= 75) {
    return "High-confidence, source-verified — tracked with continuous status updates.";
  }
  return "Active in the pipeline and tracked with source-linked updates.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = gate.supabaseAdmin ?? createClient(supabaseUrl, serviceKey);

  if (!(await isAgentEnabled(supabase, "weekly_signal"))) return pausedResponse("weekly_signal");

  const lock = await beginAgentTask(supabase, "weekly_signal", "Send weekly infrastructure signal", gate.userId ?? undefined);
  if (lock.alreadyRunning) return alreadyRunningResponse("weekly_signal");
  const taskId = lock.taskId;
  const startedAt = new Date();

  let sent = 0;
  let suppressed = 0;
  let errors = 0;

  try {
    // --- Curate 3 diverse, recently-updated, high-value projects ---
    const { data: pool, error: poolErr } = await supabase
      .from("projects")
      .select("name, country, region, sector, stage, value_label, value_usd, confidence, source_url")
      .eq("approved", true)
      .order("last_updated", { ascending: false })
      .limit(60);
    if (poolErr) throw poolErr;

    // One project per region (highest value), then take the top 3 by value.
    const byRegion = new Map<string, any>();
    for (const p of pool ?? []) {
      const key = p.region || p.country || p.name;
      const cur = byRegion.get(key);
      if (!cur || Number(p.value_usd || 0) > Number(cur.value_usd || 0)) byRegion.set(key, p);
    }
    const projects = Array.from(byRegion.values())
      .sort((a, b) => Number(b.value_usd || 0) - Number(a.value_usd || 0))
      .slice(0, 3)
      .map((p) => ({
        name: p.name,
        country: p.country,
        region: p.region,
        sector: p.sector,
        stage: p.stage,
        value_label: p.value_label,
        confidence: p.confidence,
        source_url: p.source_url || undefined,
        why: whyLine(p.stage, p.confidence),
      }));

    if (projects.length === 0) {
      await finishAgentRun(supabase, "weekly_signal", "completed", startedAt);
      return new Response(JSON.stringify({ success: true, sent: 0, note: "no projects to feature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Send to newsletter subscribers ---
    const { data: subs, error: subErr } = await supabase
      .from("subscribers")
      .select("email, name")
      .eq("type", "newsletter")
      .limit(RECIPIENT_CAP);
    if (subErr) throw subErr;

    for (const sub of subs ?? []) {
      if (!sub.email) continue;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            templateName: "weekly-signal",
            recipientEmail: sub.email,
            templateData: { name: sub.name ?? undefined, projects },
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok && payload?.success !== false) sent += 1;
        else if (res.ok && payload?.reason === "email_suppressed") suppressed += 1;
        else {
          errors += 1;
          console.error("[weekly-signal] send error", { status: res.status, payload });
        }
      } catch (e) {
        errors += 1;
        console.error("[weekly-signal] exception", e);
      }
    }

    await finishAgentRun(supabase, "weekly_signal", "completed", startedAt);
    console.log("[weekly-signal] done", { featured: projects.length, sent, suppressed, errors });
    return new Response(JSON.stringify({ success: true, featured: projects.length, sent, suppressed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await failAgentTask(supabase, "weekly_signal", taskId, startedAt, e);
    console.error("[weekly-signal] fatal", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
