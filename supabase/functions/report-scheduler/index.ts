import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

function nextRun(cadence: string, from = new Date()): string {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + (cadence === "weekly" ? 7 : 30));
  return next.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isCronRequest(req)) {
    return new Response(JSON.stringify({ error: "Scheduler authentication required." }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: schedules, error } = await admin
    .from("report_schedules")
    .select("id,user_id,report_type,parameters,cadence,next_run_at")
    .eq("enabled", true)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(20);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("AGENT_CRON_SECRET") ?? "";
  const results: Array<Record<string, unknown>> = [];
  for (const schedule of schedules ?? []) {
    const parameters = (schedule.parameters ?? {}) as Record<string, unknown>;
    const claimedNextRun = nextRun(schedule.cadence);
    const { data: claim, error: claimError } = await admin
      .from("report_schedules")
      .update({ next_run_at: claimedNextRun })
      .eq("id", schedule.id)
      .eq("next_run_at", schedule.next_run_at)
      .select("id")
      .maybeSingle();

    // Two scheduler invocations can overlap at the 15-minute boundary. Only the
    // invocation that successfully claims the due row may generate the report.
    if (claimError || !claim) {
      results.push({ id: schedule.id, status: "skipped", reason: claimError?.message ?? "already claimed" });
      continue;
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/report-agent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          ...(cronSecret ? { "x-cron-secret": cronSecret } : {}),
        },
        body: JSON.stringify({ ...parameters, report_type: schedule.report_type, user_id: schedule.user_id, scheduled: true }),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (response.ok) {
        await admin.from("report_schedules").update({ last_run_at: new Date().toISOString() }).eq("id", schedule.id);
      } else if (response.status === 402 || response.status === 403) {
        // Credit and policy denials are terminal until the owner takes action;
        // disable this schedule instead of creating a repeating failure loop.
        await admin.from("report_schedules").update({ enabled: false }).eq("id", schedule.id);
      } else {
        // Transient failures become eligible on the next scheduler tick rather
        // than silently waiting a full week or month for another attempt.
        await admin.from("report_schedules").update({ next_run_at: new Date().toISOString() }).eq("id", schedule.id);
      }
      results.push({ id: schedule.id, status: response.status, response: responseBody });
    } catch (error) {
      await admin.from("report_schedules").update({ next_run_at: new Date().toISOString() }).eq("id", schedule.id);
      results.push({ id: schedule.id, status: 500, response: { error: error instanceof Error ? error.message : "Report dispatch failed" } });
    }
  }

  return new Response(JSON.stringify({ success: true, processed: results.length, results }), { headers: corsHeaders });
});
