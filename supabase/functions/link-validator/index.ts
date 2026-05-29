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

  // 3. Run checks with bounded concurrency
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

  // 4. Upsert in chunks of 500
  for (let s = 0; s < rows.length; s += 500) {
    const slice = rows.slice(s, s + 500);
    await admin.from("source_link_checks").upsert(slice, { onConflict: "url" });
  }

  // 5. Summary counts across the whole table
  const { count: totalBroken } = await admin
    .from("source_link_checks")
    .select("*", { count: "exact", head: true })
    .eq("status", "broken");

  return new Response(
    JSON.stringify({
      mode,
      candidates: allUrls.size,
      checked: toCheck.length,
      ok: okCount,
      broken: brokenCount,
      invalid: invalidCount,
      total_broken_in_db: totalBroken ?? null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
