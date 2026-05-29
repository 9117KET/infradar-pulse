/**
 * URL hygiene utility used by every agent before writing a source URL.
 *
 * - Rejects obviously bad / placeholder / non-http URLs synchronously.
 * - Optionally HEAD-checks the URL and records the outcome in
 *   `source_link_checks` so we can monitor which models fabricate links.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BAD_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "placeholder.com",
  "domain.com",
  "yourwebsite.com",
  "lovable.dev",
  "infradarai.com", // self-reference is not a source
]);

const BAD_PATTERNS = [
  /placeholder/i,
  /your[-_]?(domain|site|url)/i,
  /lorem[-_]?ipsum/i,
  /\bexample\b/i,
];

export type UrlCheckResult =
  | { ok: true; url: string }
  | { ok: false; reason: string; status?: "broken" | "invalid"; httpCode?: number };

/** Sync sanity check — no network. */
export function isPlausibleSourceUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const url = raw.trim();
  if (url.length < 10 || url.length > 2048) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  if (BAD_HOSTS.has(host)) return false;
  if (BAD_PATTERNS.some((p) => p.test(url))) return false;
  return true;
}

/**
 * HEAD-check (GET fallback). 8s timeout. Returns true if the URL responds
 * with anything other than a 4xx/5xx or network error.
 */
export async function isReachable(url: string, timeoutMs = 8000): Promise<{ ok: boolean; httpCode?: number; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "InfraRadarAI-LinkValidator/1.0" },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "InfraRadarAI-LinkValidator/1.0" },
      });
    }
    if (res.status >= 400) return { ok: false, httpCode: res.status };
    return { ok: true, httpCode: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Returns a service-role client for writing to source_link_checks. */
function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function recordCheck(url: string, status: "ok" | "broken" | "invalid", httpCode?: number, error?: string): Promise<void> {
  try {
    const admin = adminClient();
    await admin
      .from("source_link_checks")
      .upsert(
        { url, status, http_code: httpCode ?? null, error: error ?? null, checked_at: new Date().toISOString() },
        { onConflict: "url" },
      );
  } catch (e) {
    console.error("recordCheck failed", e);
  }
}

/**
 * Full validation an agent should call before writing any source URL.
 * - Returns `{ ok: true, url }` when safe to persist.
 * - Returns `{ ok: false, reason }` otherwise and logs the rejection.
 *
 * Set `liveCheck=false` for batch flows where the caller is already running
 * the link-validator separately.
 */
export async function assertValidSourceUrl(
  raw: unknown,
  opts: { liveCheck?: boolean } = {},
): Promise<UrlCheckResult> {
  if (!isPlausibleSourceUrl(raw)) {
    return { ok: false, reason: "invalid_url", status: "invalid" };
  }
  const url = (raw as string).trim();
  if (opts.liveCheck === false) return { ok: true, url };

  const r = await isReachable(url);
  if (!r.ok) {
    await recordCheck(url, "broken", r.httpCode, r.error);
    return { ok: false, reason: "unreachable", status: "broken", httpCode: r.httpCode };
  }
  await recordCheck(url, "ok", r.httpCode);
  return { ok: true, url };
}

/** Filter an array of URLs to only the ones that pass sync hygiene. */
export function filterPlausibleUrls(urls: unknown[]): string[] {
  return urls.filter(isPlausibleSourceUrl) as string[];
}
