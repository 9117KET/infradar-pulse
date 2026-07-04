/**
 * outreach-send-agent
 *
 * The "send" half. It ONLY ever touches email messages a human has approved
 * (status='approved'). It calls send-transactional-email, which already does
 * the suppression check + unsubscribe-token injection, so compliance is reused,
 * not reimplemented. LinkedIn touches are never sent here — those are copied
 * and sent manually from the dashboard.
 *
 * On a successful send it advances the prospect to the next sequence step.
 * A daily/run cap protects sender-domain reputation.
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

const SEND_CAP = 50; // max emails per run — deliverability guardrail

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = gate.supabaseAdmin ?? createClient(supabaseUrl, serviceKey);

  if (!(await isAgentEnabled(supabase, "outreach_send"))) return pausedResponse("outreach_send");

  const lock = await beginAgentTask(supabase, "outreach_send", "Send approved outbound emails", gate.userId ?? undefined);
  if (lock.alreadyRunning) return alreadyRunningResponse("outreach_send");
  const taskId = lock.taskId;
  const startedAt = new Date();

  let sent = 0;
  let suppressed = 0;
  let errors = 0;

  try {
    const nowIso = new Date().toISOString();
    // Approved email touches that are due (scheduled_for in the past or unset).
    const { data: msgs, error: mErr } = await supabase
      .from("outreach_messages")
      .select("id, step, subject, body, prospect:outreach_prospects(id, name, email, persona, status)")
      .eq("channel", "email")
      .eq("status", "approved")
      .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
      .order("scheduled_for", { ascending: true, nullsFirst: true })
      .limit(SEND_CAP);
    if (mErr) throw mErr;

    for (const m of msgs ?? []) {
      // Supabase returns the embedded relation as an object (or array depending on FK metadata).
      const prospect = Array.isArray(m.prospect) ? m.prospect[0] : m.prospect;
      if (!prospect?.email) {
        await supabase.from("outreach_messages").update({ status: "failed", error: "prospect has no email" }).eq("id", m.id);
        errors += 1;
        continue;
      }

      const ctaUrl = `https://infradarai.com/?utm_source=outreach&utm_medium=email&utm_campaign=${encodeURIComponent(prospect.persona || "outreach")}`;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            templateName: "outreach-email",
            recipientEmail: prospect.email,
            idempotencyKey: `outreach:${m.id}`,
            templateData: {
              subject: m.subject ?? undefined,
              body: m.body,
              name: prospect.name ?? undefined,
              ctaUrl,
              ctaLabel: "Take a look — card-free",
            },
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (res.ok && payload?.success !== false) {
          await supabase
            .from("outreach_messages")
            .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
            .eq("id", m.id);

          // Advance the prospect to the next touch. Once past the last touch the
          // draft agent simply finds nothing more to draft (next_step > MAX_STEP).
          const nextStep = (m.step ?? 0) + 1;
          await supabase
            .from("outreach_prospects")
            .update({
              next_step: nextStep,
              last_contacted_at: new Date().toISOString(),
              status: "sequencing",
            })
            .eq("id", prospect.id);
          sent += 1;
        } else if (res.ok && payload?.reason === "email_suppressed") {
          // Recipient opted out / bounced — stop sequencing them.
          await supabase.from("outreach_messages").update({ status: "skipped", error: "suppressed" }).eq("id", m.id);
          await supabase.from("outreach_prospects").update({ status: "unsubscribed" }).eq("id", prospect.id);
          suppressed += 1;
        } else {
          const errMsg = `send failed: ${res.status} ${JSON.stringify(payload).slice(0, 300)}`;
          await supabase.from("outreach_messages").update({ status: "failed", error: errMsg }).eq("id", m.id);
          errors += 1;
          console.error("[outreach-send]", errMsg);
        }
      } catch (e) {
        await supabase.from("outreach_messages").update({ status: "failed", error: String(e).slice(0, 300) }).eq("id", m.id);
        errors += 1;
        console.error("[outreach-send] exception", e);
      }
    }

    await finishAgentRun(supabase, "outreach_send", "completed", startedAt);
    console.log("[outreach-send] done", { sent, suppressed, errors });
    return new Response(JSON.stringify({ success: true, sent, suppressed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await failAgentTask(supabase, "outreach_send", taskId, startedAt, e);
    console.error("[outreach-send] fatal", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
