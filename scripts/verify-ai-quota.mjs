/**
 * Verifies AI usage-limit enforcement and the paid "allow" path end-to-end
 * against a running stack (local recommended — quotas are exhausted on purpose).
 *
 * Complements verify-edge-security.mjs, which covers the free-blocked and
 * staff-bypass paths. This script proves the parts that need real quota state:
 *
 *   Q1  Free user's daily AI cap actually counts down and blocks (portfolio-chat
 *       is a free-tier AI feature; free plan = 2/day). Calls 1-2 pass the gate,
 *       call 3 returns 402 ENTITLEMENT.
 *   Q2  A non-staff Pro user is LET THROUGH the Pro plan gate on user-research
 *       (not 401/402/403). Staff bypass can't prove this — staff bypass *everything*.
 *   Q3  The same Pro user passes the Starter gate on nl-search.
 *
 * Quota is reset for the free user before Q1 (service role) so the run is idempotent.
 *
 * Env (same convention as verify-edge-security.mjs):
 *   EDGE_SECURITY_BASE_URL / EDGE_SECURITY_ANON_KEY  (or VITE_SUPABASE_* )
 *   SECURITY_TEST_FREE_EMAIL  + SECURITY_TEST_FREE_PASSWORD   (free-tier user)
 *   SECURITY_TEST_PRO_EMAIL   + SECURITY_TEST_PRO_PASSWORD    (active Pro sub, non-staff)
 *   LOCAL_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) for usage reset
 *
 * Note: with no LOVABLE_API_KEY served, calls that PASS the gate may still 4xx/5xx
 * at the LLM step — that's fine. We assert gate behavior (status codes), not LLM output.
 */
import { createClient } from "@supabase/supabase-js";

const base = (
  process.env.EDGE_SECURITY_BASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "http://127.0.0.1:54321"
).replace(/\/$/, "");

const anon =
  process.env.EDGE_SECURITY_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const serviceKey =
  process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function die(msg) {
  console.error("[verify-ai-quota]", msg);
  process.exit(1);
}

if (!anon) die("Set EDGE_SECURITY_ANON_KEY (local publishable key) or VITE_SUPABASE_PUBLISHABLE_KEY.");

async function signIn(email, password) {
  if (!email || !password) return { token: "", id: "" };
  const sb = createClient(base, anon);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`[verify-ai-quota] sign-in failed for ${email}:`, error.message);
    return { token: "", id: "" };
  }
  return { token: data.session?.access_token ?? "", id: data.user?.id ?? "" };
}

async function invoke(name, token) {
  const headers = { "Content-Type": "application/json", apikey: anon };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${base}/functions/v1/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "test", message: "test" }),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 160) }; }
    return { status: res.status, json };
  } catch (err) {
    return { status: 0, json: { fetchError: err instanceof Error ? err.message : String(err) } };
  }
}

let exitCode = 0;
function check(ok, label, detail = "") {
  console.log(ok ? "PASS" : "FAIL", "|", label, detail);
  if (!ok) exitCode = 1;
}

console.log("[verify-ai-quota] Base URL:", base);

const free = await signIn(process.env.SECURITY_TEST_FREE_EMAIL, process.env.SECURITY_TEST_FREE_PASSWORD);
const pro = await signIn(process.env.SECURITY_TEST_PRO_EMAIL, process.env.SECURITY_TEST_PRO_PASSWORD);

// ── Q1: free daily AI cap counts down and blocks ────────────────────────────
if (free.token && free.id) {
  if (serviceKey) {
    const admin = createClient(base, serviceKey);
    const { error } = await admin.from("usage_counters").delete().eq("user_id", free.id);
    if (error) console.warn("[verify-ai-quota] WARN: could not reset usage_counters:", error.message);
  } else {
    console.warn("[verify-ai-quota] WARN: no service key — quota not reset; Q1 may be off if quota already used today.");
  }

  // Free plan = 2 AI/day on a free-tier AI feature (portfolio-chat).
  const r1 = await invoke("portfolio-chat", free.token);
  const r2 = await invoke("portfolio-chat", free.token);
  const r3 = await invoke("portfolio-chat", free.token);
  check(r1.status !== 402, "free call #1 passes AI gate (not 402)", `(got ${r1.status})`);
  check(r2.status !== 402, "free call #2 passes AI gate (not 402)", `(got ${r2.status})`);
  const blocked = r3.status === 402 && String(JSON.stringify(r3.json)).includes("ENTITLEMENT");
  check(blocked, "free call #3 blocked by daily AI quota → 402 ENTITLEMENT",
    `(got ${r3.status} reason=${r3.json?.reason ?? r3.json?.code ?? JSON.stringify(r3.json).slice(0, 80)})`);
} else {
  console.log("SKIP | free quota test (set SECURITY_TEST_FREE_EMAIL + SECURITY_TEST_FREE_PASSWORD)");
}

// ── Q2/Q3: non-staff Pro user is LET THROUGH the plan gate ──────────────────
if (pro.token) {
  const r = await invoke("user-research", pro.token);
  check(![401, 402, 403].includes(r.status), "Pro user passes Pro gate on user-research (not 401/402/403)", `(got ${r.status})`);
  const r2 = await invoke("nl-search", pro.token);
  check(![401, 402, 403].includes(r2.status), "Pro user passes Starter gate on nl-search (not 401/402/403)", `(got ${r2.status})`);
} else {
  console.log("SKIP | Pro allow-path test (set SECURITY_TEST_PRO_EMAIL + SECURITY_TEST_PRO_PASSWORD)");
}

console.log("\n[verify-ai-quota] Summary:", exitCode === 0 ? "ALL PASSED" : "FAILURES DETECTED");
process.exit(exitCode);
