/**
 * cron-heartbeat-check
 *
 * Called by an EXTERNAL scheduler (GitHub Actions, cron-job.org, Vercel Cron)
 * on a 30-minute interval - INDEPENDENT of pg_cron.
 *
 * Why: the agent-health-monitor runs via pg_cron, meaning it cannot detect
 * its own failure if the vault key rotation that broke all other cron jobs
 * also silenced this one. An external ping breaks that dead-lock.
 *
 * What it checks:
 *   - MAX(last_run_at) across all enabled agents in agent_config
 *   - If no agent has run in the past 2 hours, it writes an
 *     agent_health_alert and emails admins
 *
 * Auth: requires the SUPABASE_SERVICE_ROLE_KEY as Bearer token.
 * The GitHub Action reads this from a repository secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STALE_THRESHOLD_HOURS = 2;
const SITE_NAME = "InfradarAI";
const FROM_DOMAIN = "infradarai.com";
const SENDER_DOMAIN = "notify.infradarai.com";
const APP_URL = "https://infradarai.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rawAuth = req.headers.get("Authorization") ?? "";
  const bearerToken = rawAuth.startsWith("Bearer ") ? rawAuth.slice(7) : "";
  if (bearerToken !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Find the most recent agent run across all enabled agents
    const { data: agents, error: agentErr } = await supabase
      .from("agent_config")
      .select("agent_type, last_run_at, enabled")
      .eq("enabled", true)
      .order("last_run_at", { ascending: false })
      .limit(1);

    if (agentErr) throw agentErr;

    const mostRecent = agents?.[0];
    const lastRunAt = mostRecent?.last_run_at
      ? new Date(mostRecent.last_run_at)
      : null;
    const now = new Date();
    const hoursSinceLastRun = lastRunAt
      ? (now.getTime() - lastRunAt.getTime()) / 3_600_000
      : Infinity;

    const isSilent = hoursSinceLastRun >= STALE_THRESHOLD_HOURS;

    if (!isSilent) {
      return new Response(
        JSON.stringify({
          ok: true,
          last_run_at: lastRunAt?.toISOString() ?? null,
          hours_since_last_run: Math.round(hoursSinceLastRun * 10) / 10,
          status: "healthy",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Dedupe: don't fire if we already alerted in the last 2 hours
    const dedupeCutoff = new Date(
      now.getTime() - STALE_THRESHOLD_HOURS * 3_600_000,
    ).toISOString();
    const { data: recent } = await supabase
      .from("agent_health_alerts")
      .select("id")
      .eq("alert_type", "cron_silence")
      .gte("detected_at", dedupeCutoff)
      .limit(1);

    if ((recent?.length ?? 0) > 0) {
      return new Response(
        JSON.stringify({ ok: true, status: "silent_but_already_alerted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert alert
    await supabase.from("agent_health_alerts").insert({
      alert_type: "cron_silence",
      severity: "critical",
      job_name: "pg_cron_all",
      failure_count: 0,
      total_runs: 0,
      sample_message: `No enabled agent has run in the last ${Math.round(hoursSinceLastRun)}h. pg_cron may be stalled or vault keys may be stale.`,
      details: {
        last_run_at: lastRunAt?.toISOString() ?? null,
        hours_since_last_run: Math.round(hoursSinceLastRun * 10) / 10,
        detected_by: "external-heartbeat",
        hint: "Check pg_cron.job_run_details and rotate email_queue_service_role_key vault secret",
      },
    });

    // Email admins
    const { data: admins } = await supabase.rpc("list_admin_emails");
    const recipients = ((admins ?? []) as { email: string }[])
      .map((a) => a.email)
      .filter(Boolean);

    for (const to of recipients) {
      const messageId = crypto.randomUUID();
      await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `[${SITE_NAME}] CRITICAL: All scheduled agents have been silent for ${Math.round(hoursSinceLastRun)}h`,
          html: `<p>No enabled agent has run in the last <strong>${Math.round(hoursSinceLastRun)} hours</strong>. This was detected by the <strong>external heartbeat</strong> — pg_cron itself may be stalled.</p><p>Last recorded run: <code>${lastRunAt?.toISOString() ?? "unknown"}</code></p><p>Most likely cause: stale <code>email_queue_service_role_key</code> vault secret. Rotate it to match the current <code>SUPABASE_SERVICE_ROLE_KEY</code>.</p><p><a href="${APP_URL}/dashboard/agent-health">Open Agent Health dashboard</a></p>`,
          text: `CRITICAL: No enabled agent has run in the last ${Math.round(hoursSinceLastRun)}h.\n\nLast run: ${lastRunAt?.toISOString() ?? "unknown"}\n\nFix: rotate email_queue_service_role_key vault secret.\n\n${APP_URL}/dashboard/agent-health`,
          purpose: "transactional",
          label: "cron_silence_alert",
          idempotency_key: `cron-silence-${now.toISOString().slice(0, 13)}-${to}`,
          queued_at: now.toISOString(),
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: "alerted",
        hours_since_last_run: Math.round(hoursSinceLastRun * 10) / 10,
        emailed: recipients.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("cron-heartbeat-check failed", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
