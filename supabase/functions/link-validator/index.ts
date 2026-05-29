/**
 * link-validator — checks every source URL we surface (evidence_sources,
 * projects.source_url, project_contacts.source_url, insights.sources[].url)
 * and records the result in `source_link_checks`.
 *
 * - Staff-only invocation.
 * - Batches concurrent HEAD requests to keep cron-friendly.
 * - Defaults to re-checking only URLs older than 7d OR previously broken.
 *
 * Body:
 *   { mode?: 'incremental' | 'full', batch?: number, concurrency?: number }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isReachable, isPlausibleSourceUrl } from "../_shared/urlHygiene.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function collectAllUrls(admin: ReturnType<typeof createClient>): Promise<Set<string>> {
  const urls = new Set<string>();

  const pageSize = 1000;
  for (const table of ["evidence_sources"] as const) {
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await admin.from(table).select("url").range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      for (const row of data) {
        const u = (row as { url?: string }).url;
        if (u) urls.add(u);
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  // projects.source_url
  {
    let from = 0;
    while (true) {
      const { data } = await admin.from("projects").select("source_url").range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const u = (row as { source_url?: string | null }).source_url;
        if (u) urls.add(u);
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  // project_contacts.source_url
  {
    let from = 0;
    while (true) {
      const { data } = await admin.from("project_contacts").select("source_url").range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const u = (row as { source_url?: string | null }).source_url;
        if (u) urls.add(u);
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  // insights.sources[].url
  {
    const { data } = await admin.from("insights").select("sources");
    if (data) {
      for (const row of data) {
        const sources = (row as { sources?: Array<{ url?: string }> }).sources ?? [];
        for (const s of sources) if (s?.url) urls.add(s.url);
      }
    }
  }

  return urls;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Staff guard — also allow direct service-role invocation from pg_cron
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const isServiceRole = bearerToken === serviceKey;

  if (!isServiceRole) {
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("researcher")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const body = await req.json().catch(() => ({}));
  const mode: "incremental" | "full" = body?.mode === "full" ? "full" : "incremental";
  const batch: number = Math.min(2000, Math.max(50, body?.batch ?? 500));
  const concurrency: number = Math.min(20, Math.max(2, body?.concurrency ?? 8));

  // 1. Collect all candidate URLs
  const allUrls = await collectAllUrls(admin);

  // 2. Filter to "needs check" based on mode
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  let toCheck: string[];
  if (mode === "full") {
    toCheck = Array.from(allUrls);
  } else {
    const { data: existing } = await admin
      .from("source_link_checks")
      .select("url, status, checked_at")
      .gte("checked_at", sevenDaysAgo)
      .eq("status", "ok");
    const skip = new Set((existing ?? []).map((r: { url: string }) => r.url));
    toCheck = Array.from(allUrls).filter((u) => !skip.has(u));
  }

  toCheck = toCheck.slice(0, batch);

  // 3. Snapshot prior statuses so we can detect newly-broken URLs
  const priorStatus = new Map<string, string>();
  for (let s = 0; s < toCheck.length; s += 1000) {
    const slice = toCheck.slice(s, s + 1000);
    const { data: prior } = await admin
      .from("source_link_checks")
      .select("url, status")
      .in("url", slice);
    for (const r of prior ?? []) {
      priorStatus.set((r as { url: string }).url, (r as { status: string }).status);
    }
  }

  // 4. Run checks with bounded concurrency
  let okCount = 0, brokenCount = 0, invalidCount = 0;
  const rows: Array<{ url: string; status: string; http_code: number | null; error: string | null; checked_at: string }> = [];

  const now = new Date().toISOString();
  let i = 0;
  async function worker() {
    while (i < toCheck.length) {
      const idx = i++;
      const url = toCheck[idx];
      if (!isPlausibleSourceUrl(url)) {
        invalidCount++;
        rows.push({ url, status: "invalid", http_code: null, error: "fails sync hygiene", checked_at: now });
        continue;
      }
      const r = await isReachable(url);
      if (r.ok) {
        okCount++;
        rows.push({ url, status: "ok", http_code: r.httpCode ?? null, error: null, checked_at: now });
      } else {
        brokenCount++;
        rows.push({ url, status: "broken", http_code: r.httpCode ?? null, error: r.error ?? null, checked_at: now });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // 5. Upsert in chunks of 500
  for (let s = 0; s < rows.length; s += 500) {
    const slice = rows.slice(s, s + 500);
    await admin.from("source_link_checks").upsert(slice, { onConflict: "url" });
  }

  // 6. Newly-broken URLs (previously absent or "ok")
  const newlyBroken = rows.filter(
    (r) => r.status === "broken" && (priorStatus.get(r.url) ?? "ok") !== "broken",
  );

  // 7. Summary counts across the whole table
  const { count: totalBroken } = await admin
    .from("source_link_checks")
    .select("*", { count: "exact", head: true })
    .eq("status", "broken");

  // 8. Notify (dashboard alert + email admins) when newly-broken exceeds threshold
  const threshold = Math.max(1, parseInt(Deno.env.get("LINK_VALIDATOR_ALERT_THRESHOLD") ?? "5", 10));
  let alerted = false;
  let emailedAdmins = 0;
  if (newlyBroken.length >= threshold) {
    // Dedupe: skip if an unresolved newly_broken_sources alert already exists in last 24h
    const dedupeCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent } = await admin
      .from("agent_health_alerts")
      .select("id")
      .eq("alert_type", "newly_broken_sources")
      .gte("detected_at", dedupeCutoff)
      .is("resolved_at", null)
      .limit(1);

    if (!recent || recent.length === 0) {
      const sampleUrls = newlyBroken.slice(0, 10).map((r) => ({ url: r.url, http_code: r.http_code, error: r.error }));
      const { data: alertRow } = await admin
        .from("agent_health_alerts")
        .insert({
          alert_type: "newly_broken_sources",
          severity: newlyBroken.length >= threshold * 4 ? "critical" : "high",
          job_name: "weekly-link-validator",
          failure_count: newlyBroken.length,
          total_runs: toCheck.length,
          sample_message: `${newlyBroken.length} source URLs newly broken (threshold ${threshold}). Sample: ${newlyBroken.slice(0, 3).map((r) => r.url).join(", ")}`,
          details: {
            mode,
            checked: toCheck.length,
            newly_broken: newlyBroken.length,
            total_broken_in_db: totalBroken ?? null,
            threshold,
            sample_urls: sampleUrls,
          },
        })
        .select("id")
        .single();
      alerted = true;

      try {
        const { data: admins } = await admin.rpc("list_admin_emails");
        const recipients = ((admins ?? []) as { email: string }[]).map((a) => a.email).filter(Boolean);
        const SITE_NAME = "InfraDarAI";
        const FROM_DOMAIN = "infradarai.com";
        const SENDER_DOMAIN = "notify.infradarai.com";
        const APP_URL = "https://infradarai.com";
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const sampleRows = sampleUrls.map((s) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;"><a href="${esc(s.url)}" style="color:#0f172a;">${esc(s.url.slice(0, 80))}</a></td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#b91c1c;">${s.http_code ?? "—"}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#475569;font-size:12px;">${esc((s.error ?? "").slice(0, 160))}</td>
          </tr>`).join("");
        const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
          <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
            <div style="background:#dc2626;color:#fff;padding:16px 20px;">
              <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Source Health Alert</div>
              <div style="font-size:20px;font-weight:600;margin-top:4px;">${newlyBroken.length} source URLs newly broken</div>
            </div>
            <div style="padding:20px;">
              <p style="margin:0 0 12px 0;">The weekly link validator found <strong>${newlyBroken.length}</strong> source URLs that were previously reachable (or new) and are now broken. This exceeds the alert threshold of <strong>${threshold}</strong>.</p>
              <p style="margin:0 0 12px 0;color:#475569;">Checked ${toCheck.length} URLs in this run · ${totalBroken ?? 0} total broken in DB.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <thead><tr style="background:#f8fafc;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;">URL</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;">HTTP</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;">Error</th>
                </tr></thead>
                <tbody>${sampleRows}</tbody>
              </table>
              <p style="margin:16px 0 0 0;"><a href="${APP_URL}/dashboard/source-health" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Open Source Health</a></p>
            </div>
            <div style="padding:12px 20px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
              Sent automatically by link-validator. You are receiving this because you are an admin on ${SITE_NAME}.
            </div>
          </div></body></html>`;
        const text = `Source Health Alert — ${newlyBroken.length} URLs newly broken (threshold ${threshold}).\n\n${sampleUrls.map((s) => `- ${s.url} [${s.http_code ?? "—"}] ${s.error ?? ""}`).join("\n")}\n\nOpen: ${APP_URL}/dashboard/source-health`;

        for (const to of recipients) {
          const { error: enqErr } = await admin.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              message_id: crypto.randomUUID(),
              to,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject: `[${SITE_NAME}] ${newlyBroken.length} source URLs newly broken`,
              html,
              text,
              purpose: "transactional",
              label: "source_health_alert",
              idempotency_key: `source-health-${new Date().toISOString().slice(0, 10)}-${to}`,
              queued_at: new Date().toISOString(),
            },
          });
          if (!enqErr) emailedAdmins++;
        }

        if (alertRow?.id) {
          await admin
            .from("agent_health_alerts")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", alertRow.id);
        }
      } catch (e) {
        console.error("[link-validator] notification error", e);
      }
    }
  }

  return new Response(
    JSON.stringify({
      mode,
      candidates: allUrls.size,
      checked: toCheck.length,
      ok: okCount,
      broken: brokenCount,
      invalid: invalidCount,
      newly_broken: newlyBroken.length,
      total_broken_in_db: totalBroken ?? null,
      alert_raised: alerted,
      emailed_admins: emailedAdmins,
      threshold,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
