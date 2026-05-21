/**
 * review-queue-digest
 *
 * Daily cron at 08:00 UTC. Emails staff (admins + researchers) when the
 * Pipeline Candidates review queue has backed up. Backlog signal:
 *   - >= 25 candidates with review_status='ready_for_review', OR
 *   - oldest ready_for_review candidate is >= 5 days old.
 *
 * Idempotency: keyed per recipient per UTC day so a re-run never double-sends.
 * Service-role bearer guard (same pattern as agent-health-monitor).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "InfraDarAI";
const FROM_DOMAIN = "infradarai.com";
const SENDER_DOMAIN = "notify.infradarai.com";
const APP_URL = "https://infradarai.com";

const BACKLOG_THRESHOLD = 25;
const STALE_DAYS_THRESHOLD = 5;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

interface Candidate {
  id: string;
  name: string;
  country: string | null;
  sector: string | null;
  created_at: string;
  confidence: number;
}

function buildHtml(opts: {
  total: number;
  stale: number;
  oldestDays: number;
  pendingUpdates: number;
  bySector: Array<[string, number]>;
  oldest: Candidate[];
}): string {
  const oldestRows = opts.oldest
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(c.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#475569;">${escapeHtml(c.country ?? "—")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#475569;">${escapeHtml(c.sector ?? "—")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#b91c1c;font-weight:600;">${daysAgo(c.created_at)}d</td>
      </tr>`,
    )
    .join("");

  const sectorRows = opts.bySector
    .map(
      ([sector, n]) =>
        `<li style="margin:4px 0;"><strong>${escapeHtml(sector || "Unknown")}</strong>: ${n}</li>`,
    )
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;color:#fff;padding:16px 20px;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Review Queue Digest</div>
      <div style="font-size:20px;font-weight:600;margin-top:4px;">${opts.total} candidates awaiting verification</div>
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 8px 0;"><strong>${opts.total}</strong> candidates are ready for review${opts.stale > 0 ? ` — <strong style="color:#b91c1c;">${opts.stale}</strong> have been waiting over ${STALE_DAYS_THRESHOLD} days</strong>` : ""}.</p>
      <p style="margin:0 0 16px 0;color:#475569;">Oldest candidate: <strong>${opts.oldestDays} days</strong> old. Pending update proposals: <strong>${opts.pendingUpdates}</strong>.</p>

      <h3 style="font-size:14px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin:20px 0 8px;">Oldest waiting</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Candidate</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Country</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Sector</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Age</th>
          </tr>
        </thead>
        <tbody>${oldestRows}</tbody>
      </table>

      ${sectorRows ? `<h3 style="font-size:14px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin:20px 0 8px;">By sector</h3><ul style="margin:0;padding-left:20px;">${sectorRows}</ul>` : ""}

      <p style="margin:24px 0 0;"><a href="${APP_URL}/dashboard/review" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Open Review Queue</a></p>
    </div>
    <div style="padding:12px 20px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
      Sent because the review queue crossed a backlog threshold. ${SITE_NAME}
    </div>
  </div>
</body></html>`;
}

function buildText(total: number, oldestDays: number, oldest: Candidate[]): string {
  const lines = oldest
    .map((c) => `  - ${c.name} (${c.country ?? "—"}, ${c.sector ?? "—"}) — ${daysAgo(c.created_at)}d old`)
    .join("\n");
  return `${SITE_NAME} Review Queue Digest

${total} candidates are ready for review. Oldest is ${oldestDays} days old.

Top waiting:
${lines}

Open: ${APP_URL}/dashboard/review
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rawAuth = req.headers.get("Authorization") ?? "";
  const bearer = rawAuth.startsWith("Bearer ") ? rawAuth.slice(7) : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || bearer !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Count + fetch oldest ready_for_review candidates
    const { data: candidates, error: candErr, count } = await supabase
      .from("project_candidates")
      .select("id,name,country,sector,created_at,confidence", { count: "exact" })
      .eq("review_status", "ready_for_review")
      .order("created_at", { ascending: true })
      .limit(10);
    if (candErr) throw candErr;

    const total = count ?? 0;
    const oldest = (candidates ?? []) as Candidate[];
    const oldestDays = oldest.length > 0 ? daysAgo(oldest[0].created_at) : 0;
    const stale = oldest.filter((c) => daysAgo(c.created_at) >= STALE_DAYS_THRESHOLD).length;

    const trigger = total >= BACKLOG_THRESHOLD || oldestDays >= STALE_DAYS_THRESHOLD;
    if (!trigger) {
      return new Response(
        JSON.stringify({ success: true, sent: false, total, oldest_days: oldestDays, reason: "below_threshold" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sector breakdown
    const sectorMap = new Map<string, number>();
    for (const c of oldest) {
      const k = c.sector ?? "Unknown";
      sectorMap.set(k, (sectorMap.get(k) ?? 0) + 1);
    }
    const bySector = [...sectorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Pending update proposals
    const { count: pendingUpdates } = await supabase
      .from("update_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    // Recipients
    const { data: staff, error: staffErr } = await supabase.rpc("list_staff_emails");
    if (staffErr) throw staffErr;
    const recipients = ((staff ?? []) as { email: string }[]).map((s) => s.email).filter(Boolean);

    const html = buildHtml({
      total,
      stale,
      oldestDays,
      pendingUpdates: pendingUpdates ?? 0,
      bySector,
      oldest,
    });
    const text = buildText(total, oldestDays, oldest);

    const dayKey = new Date().toISOString().slice(0, 10);
    let emailed = 0;
    for (const to of recipients) {
      const { error: enqErr } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: crypto.randomUUID(),
          to,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `[${SITE_NAME}] ${total} candidates in review queue (oldest ${oldestDays}d)`,
          html,
          text,
          purpose: "transactional",
          label: "review_queue_digest",
          idempotency_key: `review-digest-${dayKey}-${to}`,
          queued_at: new Date().toISOString(),
        },
      });
      if (!enqErr) emailed++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: true,
        total,
        oldest_days: oldestDays,
        stale_count: stale,
        emailed,
        recipients: recipients.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("review-queue-digest failed", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
