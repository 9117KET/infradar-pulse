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
 *   - MAX(last_run_at) across all enabled agents in agent_config that have
 *     actually run at least once
 *   - If no agent has run in the past 2 hours, it writes an
 *     agent_health_alert and emails admins
 *
 * NOTIFICATION CHANNELS - read this before relying on the email:
 *   The admin email is enqueued via `enqueue_email`, and the queue is drained
 *   by `process-email-queue`, which is itself a pg_cron job. So in the exact
 *   scenario this function exists to detect (pg_cron stalled / stale vault
 *   key) the email will sit in the queue undelivered. The email is therefore
 *   BEST-EFFORT only. The reliable, pg_cron-independent signal is the caller:
 *   every response carries an `alert` boolean, and the GitHub Action fails the
 *   run when it is true - a red scheduled workflow emails the repo owner
 *   without touching any Supabase infrastructure.
 *
 * Auth: send the shared secret as a Bearer token. Accepted values:
 *   1. CRON_HEARTBEAT_SECRET - preferred. A dedicated Edge Function secret,
 *      independent of Supabase key rotation. Set it in
 *      Supabase -> Edge Functions -> Secrets AND as the GitHub repository
 *      secret of the same name.
 *   2. SUPABASE_SERVICE_ROLE_KEY - legacy fallback, auto-injected by the
 *      platform. Fragile: rotating project keys silently breaks the caller.
 * If neither is configured server-side the function returns 503 (not 401) so
 * a misconfigured server is distinguishable from a bad caller token.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const STALE_THRESHOLD_HOURS = 2;
const SITE_NAME = "InfradarAI";
const FROM_DOMAIN = "infradarai.com";
const SENDER_DOMAIN = "notify.infradarai.com";
const APP_URL = "https://infradarai.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

/** Compare fixed-length digests without leaking a byte-position timing signal. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_HEARTBEAT_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronHeaderOk = isCronRequest(req);

  // Echoed on auth failures so the caller's log says which side is misconfigured.
  // Names only - never values.
  const accepts: string[] = [];
  if (Deno.env.get("AGENT_CRON_SECRET")) accepts.push("AGENT_CRON_SECRET (x-cron-secret header)");
  if (cronSecret) accepts.push("CRON_HEARTBEAT_SECRET");
  if (serviceKey) accepts.push("SUPABASE_SERVICE_ROLE_KEY");

  if (accepts.length === 0) {
    return json({
      error: "Heartbeat auth is not configured on the server",
      hint:
        "Set AGENT_CRON_SECRET (preferred) or CRON_HEARTBEAT_SECRET as an Edge Function secret, then set the matching GitHub repository secret.",
    }, 503);
  }

  let authorized = cronHeaderOk;

  if (!authorized) {
    const rawAuth = req.headers.get("Authorization") ?? "";
    const bearerToken = rawAuth.startsWith("Bearer ") ? rawAuth.slice(7).trim() : "";
    if (bearerToken) {
      const presented = await sha256(bearerToken);
      for (const candidate of [cronSecret, serviceKey]) {
        if (!candidate) continue;
        if (constantTimeEqual(presented, await sha256(candidate))) {
          authorized = true;
          break;
        }
      }
    }
  }
  if (!authorized) {
    return json({
      error: "Unauthorized",
      accepts,
      hint:
        "The bearer token does not match any configured heartbeat secret. Re-copy the value into the caller's secret store.",
    }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Most recent run across all enabled agents.
    // `.not("last_run_at", "is", null)` is load-bearing: Postgres orders DESC
    // with NULLS FIRST, so a single enabled-but-never-run agent would otherwise
    // come back first and make every check report Infinity hours of silence.
    const { data: agents, error: agentErr } = await supabase
      .from("agent_config")
      .select("agent_type, last_run_at, enabled")
      .eq("enabled", true)
      .not("last_run_at", "is", null)
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
      return json({
        ok: true,
        alert: false,
        last_run_at: lastRunAt?.toISOString() ?? null,
        last_run_agent: mostRecent?.agent_type ?? null,
        hours_since_last_run: Math.round(hoursSinceLastRun * 10) / 10,
        status: "healthy",
      });
    }

    const hoursLabel = Number.isFinite(hoursSinceLastRun)
      ? `${Math.round(hoursSinceLastRun)}h`
      : "an unknown number of hours (no agent has ever recorded a run)";

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

    // Still silent - keep alert:true so the external caller keeps signalling,
    // even though we suppress the duplicate row/email.
    if ((recent?.length ?? 0) > 0) {
      return json({
        ok: true,
        alert: true,
        status: "silent_but_already_alerted",
        last_run_at: lastRunAt?.toISOString() ?? null,
        hours_since_last_run: Number.isFinite(hoursSinceLastRun)
          ? Math.round(hoursSinceLastRun * 10) / 10
          : null,
      });
    }

    // Insert alert
    await supabase.from("agent_health_alerts").insert({
      alert_type: "cron_silence",
      severity: "critical",
      job_name: "pg_cron_all",
      failure_count: 0,
      total_runs: 0,
      sample_message:
        `No enabled agent has run in the last ${hoursLabel}. pg_cron may be stalled or vault keys may be stale.`,
      details: {
        last_run_at: lastRunAt?.toISOString() ?? null,
        hours_since_last_run: Number.isFinite(hoursSinceLastRun)
          ? Math.round(hoursSinceLastRun * 10) / 10
          : null,
        detected_by: "external-heartbeat",
        hint:
          "Check pg_cron.job_run_details and rotate email_queue_service_role_key vault secret",
      },
    });

    // Email admins - BEST EFFORT ONLY. process-email-queue is a pg_cron job, so
    // if pg_cron is the thing that died this never leaves the queue. The
    // caller's alert:true handling is the channel you can actually trust.
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
          subject:
            `[${SITE_NAME}] CRITICAL: All scheduled agents have been silent for ${hoursLabel}`,
          html:
            `<p>No enabled agent has run in the last <strong>${hoursLabel}</strong>. This was detected by the <strong>external heartbeat</strong> — pg_cron itself may be stalled.</p><p>Last recorded run: <code>${
              lastRunAt?.toISOString() ?? "unknown"
            }</code></p><p>Most likely cause: stale <code>email_queue_service_role_key</code> vault secret. Rotate it to match the current <code>SUPABASE_SERVICE_ROLE_KEY</code>.</p><p><a href="${APP_URL}/dashboard/agent-health">Open Agent Health dashboard</a></p>`,
          text:
            `CRITICAL: No enabled agent has run in the last ${hoursLabel}.\n\nLast run: ${
              lastRunAt?.toISOString() ?? "unknown"
            }\n\nFix: rotate email_queue_service_role_key vault secret.\n\n${APP_URL}/dashboard/agent-health`,
          purpose: "transactional",
          label: "cron_silence_alert",
          idempotency_key: `cron-silence-${now.toISOString().slice(0, 13)}-${to}`,
          queued_at: now.toISOString(),
        },
      });
    }

    return json({
      ok: true,
      alert: true,
      status: "alerted",
      last_run_at: lastRunAt?.toISOString() ?? null,
      hours_since_last_run: Number.isFinite(hoursSinceLastRun)
        ? Math.round(hoursSinceLastRun * 10) / 10
        : null,
      emailed: recipients.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("cron-heartbeat-check failed", message);
    return json({ ok: false, alert: true, error: message }, 500);
  }
});
