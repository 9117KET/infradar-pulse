/**
 * agent-health-monitor
 *
 * Runs hourly via pg_cron. Detects HTTP 401 / service-role / unauthorized
 * failure patterns in cron.job_run_details and:
 *   1. Records a row in public.agent_health_alerts (deduped per job per hour)
 *   2. Auto-resolves prior alerts for jobs that have recovered
 *   3. Emails admins a single summary of newly-detected auth-failure jobs
 *
 * This makes silent breakage (e.g. stale email_queue_service_role_key vault
 * secret blocking 25+ scheduled agents with HTTP 401) visible immediately on
 * the AgentMonitoring dashboard and via email.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "InfraDarAI";
const FROM_DOMAIN = "infradarai.com";
const SENDER_DOMAIN = "notify.infradarai.com";
const APP_URL = "https://infradarai.com";

interface AffectedJob {
  job_name: string;
  auth_failures: number;
  total_runs: number;
  last_run_at: string;
  sample_message: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(jobs: AffectedJob[], windowHours: number): string {
  const rows = jobs
    .map(
      (j) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${escapeHtml(j.job_name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#b91c1c;font-weight:600;">${j.auth_failures}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${j.total_runs}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#475569;font-size:12px;">${escapeHtml((j.sample_message ?? "").slice(0, 240))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#dc2626;color:#fff;padding:16px 20px;">
      <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Agent Health Alert</div>
      <div style="font-size:20px;font-weight:600;margin-top:4px;">Scheduled agents are failing with auth errors</div>
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 12px 0;">In the last <strong>${windowHours}h</strong>, <strong>${jobs.length}</strong> scheduled job${jobs.length === 1 ? "" : "s"} returned HTTP 401 / unauthorized errors. This usually means the <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">email_queue_service_role_key</code> vault secret is stale or misconfigured.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;">Job</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;">Auth fails</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;">Total runs</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;">Sample error</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 8px 0;"><strong>Fix:</strong> rotate or re-set <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">email_queue_service_role_key</code> in Vault to match the current <code>SUPABASE_SERVICE_ROLE_KEY</code>.</p>
      <p style="margin:0;"><a href="${APP_URL}/dashboard/agents" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Open Agent Monitoring</a></p>
    </div>
    <div style="padding:12px 20px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
      Sent automatically by agent-health-monitor. You are receiving this because you are an admin on ${SITE_NAME}.
    </div>
  </div>
</body></html>`;
}

function buildEmailText(jobs: AffectedJob[], windowHours: number): string {
  const lines = jobs.map(
    (j) =>
      `- ${j.job_name}: ${j.auth_failures} auth failures / ${j.total_runs} runs — ${(j.sample_message ?? "").slice(0, 200)}`,
  );
  return `Agent Health Alert — Scheduled jobs failing with HTTP 401 / unauthorized

In the last ${windowHours}h, ${jobs.length} scheduled job(s) returned auth errors:

${lines.join("\n")}

Fix: rotate or re-set the email_queue_service_role_key vault secret to match the current SUPABASE_SERVICE_ROLE_KEY.

Open: ${APP_URL}/dashboard/agents
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
  const windowHours = 1;
  const dedupeHours = 6; // don't re-alert for the same job within 6h

  try {
    // 1. Detect auth failures
    const { data: detection, error: detErr } = await supabase.rpc(
      "detect_agent_auth_failures",
      { p_hours: windowHours },
    );
    if (detErr) throw detErr;

    const jobs = ((detection?.jobs ?? []) as AffectedJob[]).filter(
      (j) => j.auth_failures > 0,
    );

    // 2. Auto-resolve alerts for jobs not currently failing.
    //    Pull all open alerts, resolve those whose job is no longer in the failing list.
    const { data: openAlerts } = await supabase
      .from("agent_health_alerts")
      .select("id, job_name")
      .is("resolved_at", null)
      .eq("alert_type", "cron_auth_failure");

    const failingNames = new Set(jobs.map((j) => j.job_name));
    const toResolve = (openAlerts ?? []).filter(
      (a) => a.job_name && !failingNames.has(a.job_name),
    );
    if (toResolve.length > 0) {
      await supabase
        .from("agent_health_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .in("id", toResolve.map((a) => a.id));
    }

    // 3. Insert new alerts (deduped: skip if an open or recently-created alert
    //    for the same job already exists within the dedupe window).
    const cutoff = new Date(Date.now() - dedupeHours * 3600 * 1000).toISOString();
    const { data: recentByJob } = await supabase
      .from("agent_health_alerts")
      .select("job_name, detected_at, resolved_at")
      .eq("alert_type", "cron_auth_failure")
      .gte("detected_at", cutoff);

    const suppressed = new Set(
      (recentByJob ?? [])
        .filter((r) => r.resolved_at === null || r.detected_at >= cutoff)
        .map((r) => r.job_name as string),
    );

    const newJobs = jobs.filter((j) => !suppressed.has(j.job_name));

    if (newJobs.length > 0) {
      await supabase.from("agent_health_alerts").insert(
        newJobs.map((j) => ({
          alert_type: "cron_auth_failure",
          severity: "high",
          job_name: j.job_name,
          failure_count: j.auth_failures,
          total_runs: j.total_runs,
          sample_message: (j.sample_message ?? "").slice(0, 1000),
          details: {
            window_hours: windowHours,
            last_run_at: j.last_run_at,
            hint: "Likely stale email_queue_service_role_key vault secret",
          },
        })),
      );
    }

    // 4. Email admins (only when there is at least one newly-detected job)
    let emailedTo: string[] = [];
    if (newJobs.length > 0) {
      const { data: admins } = await supabase.rpc("list_admin_emails");
      const recipients = ((admins ?? []) as { email: string }[])
        .map((a) => a.email)
        .filter(Boolean);
      const html = buildEmailHtml(newJobs, windowHours);
      const text = buildEmailText(newJobs, windowHours);

      for (const to of recipients) {
        const messageId = crypto.randomUUID();
        const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: `[${SITE_NAME}] ${newJobs.length} scheduled agent${newJobs.length === 1 ? "" : "s"} failing with 401`,
            html,
            text,
            purpose: "transactional",
            label: "agent_health_alert",
            idempotency_key: `agent-health-${new Date().toISOString().slice(0, 13)}-${to}`,
            queued_at: new Date().toISOString(),
          },
        });
        if (!enqueueErr) emailedTo.push(to);
      }

      // Mark the just-inserted alerts as notified
      await supabase
        .from("agent_health_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("alert_type", "cron_auth_failure")
        .is("notified_at", null)
        .in("job_name", newJobs.map((j) => j.job_name));
    }

    return new Response(
      JSON.stringify({
        success: true,
        window_hours: windowHours,
        total_auth_failures: detection?.total_auth_failures ?? 0,
        affected_jobs: jobs.length,
        new_alerts: newJobs.length,
        resolved_alerts: toResolve.length,
        emailed_admins: emailedTo.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("agent-health-monitor failed", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
