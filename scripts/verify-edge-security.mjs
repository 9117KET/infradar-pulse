/**
 * Smoke-test Edge Function auth gates (local or hosted).
 * Loads env from process (use: node --env-file=.env scripts/verify-edge-security.mjs).
 *
 * URL + anon key (must match: same project):
 *   EDGE_SECURITY_BASE_URL — optional; overrides VITE_SUPABASE_URL for this script only.
 *   EDGE_SECURITY_ANON_KEY — optional; Publishable key for that base.
 *
 * JWT tests — either paste tokens OR sign-in (preferred; avoids long-lived JWTs in .env):
 *   SECURITY_TEST_ACCESS_TOKEN / SECURITY_TEST_ACCESS_TOKEN_STAFF
 *   SECURITY_TEST_USER_EMAIL + SECURITY_TEST_USER_PASSWORD (role: user in user_roles)
 *   SECURITY_TEST_STAFF_EMAIL + SECURITY_TEST_STAFF_PASSWORD (user_roles.role = admin | researcher)
 *
 * Does not print tokens. Exits non-zero if a required check fails.
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

function fail(msg) {
  console.error("[verify-edge-security]", msg);
  process.exit(1);
}

if (!anon) {
  fail(
    "Set EDGE_SECURITY_ANON_KEY (local) or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY in .env",
  );
}

const isLocal = base.includes("127.0.0.1") || base.includes("localhost");

async function resolveTestTokens() {
  let nonStaff = process.env.SECURITY_TEST_ACCESS_TOKEN || "";
  let staff = process.env.SECURITY_TEST_ACCESS_TOKEN_STAFF || "";

  if (!nonStaff && process.env.SECURITY_TEST_USER_EMAIL && process.env.SECURITY_TEST_USER_PASSWORD) {
    const sb = createClient(base, anon);
    const { data, error } = await sb.auth.signInWithPassword({
      email: process.env.SECURITY_TEST_USER_EMAIL,
      password: process.env.SECURITY_TEST_USER_PASSWORD,
    });
    if (error) {
      console.error("[verify-edge-security] Non-staff sign-in failed:", error.message);
    } else {
      nonStaff = data.session?.access_token ?? "";
    }
  }

  if (!staff && process.env.SECURITY_TEST_STAFF_EMAIL && process.env.SECURITY_TEST_STAFF_PASSWORD) {
    const sb = createClient(base, anon);
    const { data, error } = await sb.auth.signInWithPassword({
      email: process.env.SECURITY_TEST_STAFF_EMAIL,
      password: process.env.SECURITY_TEST_STAFF_PASSWORD,
    });
    if (error) {
      console.error("[verify-edge-security] Staff sign-in failed:", error.message);
    } else {
      staff = data.session?.access_token ?? "";
    }
  }

  return { nonStaff, staff };
}

async function invokeFunction(name, accessToken) {
  const url = `${base}/functions/v1/${name}`;
  const headers = {
    "Content-Type": "application/json",
    apikey: anon,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: "{}",
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, json };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 0, json: { fetchError: msg }, fetchError: true };
  }
}

let exitCode = 0;

console.log("[verify-edge-security] Base URL:", base);
if (process.env.EDGE_SECURITY_BASE_URL || process.env.EDGE_SECURITY_ANON_KEY) {
  console.log("[verify-edge-security] Using EDGE_SECURITY_BASE_URL / EDGE_SECURITY_ANON_KEY for this run.");
}
if (isLocal && !process.env.EDGE_SECURITY_ANON_KEY && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    "[verify-edge-security] WARN: Local URL but anon key came from VITE (usually hosted). Set EDGE_SECURITY_ANON_KEY to the Publishable key from `npm run supabase -- status` so apikey matches the local stack.",
  );
}

const { nonStaff, staff } = await resolveTestTokens();

// H1: Staff function rejects missing auth → 401
const noAuth = await invokeFunction("alert-intelligence");
if (noAuth.fetchError) {
  console.log("FAIL", "| network (is Docker + supabase start + functions serve running?)", noAuth.json?.fetchError);
  exitCode = 1;
} else {
  const h1 = noAuth.status === 401;
  console.log(h1 ? "PASS" : "FAIL", "| staff fn + no Authorization → 401", "(got", noAuth.status + ")");
  if (!h1) exitCode = 1;
}

// H2: Staff function + non-staff JWT → 403 + STAFF_ONLY
if (nonStaff) {
  const r2 = await invokeFunction("alert-intelligence", nonStaff);
  const h2 = r2.status === 403 && String(JSON.stringify(r2.json)).includes("STAFF_ONLY");
  console.log(h2 ? "PASS" : "FAIL", "| staff fn + non-staff JWT → 403 STAFF_ONLY", "(got", r2.status + ")");
  if (!h2) exitCode = 1;
} else {
  console.log(
    "SKIP | staff fn + non-staff JWT (set SECURITY_TEST_ACCESS_TOKEN or SECURITY_TEST_USER_EMAIL + SECURITY_TEST_USER_PASSWORD)",
  );
}

// H3: AI function rejects missing auth → 401
const noAuthAi = await invokeFunction("user-research");
if (noAuthAi.fetchError) {
  console.log("FAIL", "| network (user-research)", noAuthAi.json?.fetchError);
  exitCode = 1;
} else {
  const h3 = noAuthAi.status === 401;
  console.log(h3 ? "PASS" : "FAIL", "| AI fn + no Authorization → 401", "(got", noAuthAi.status + ")");
  if (!h3) exitCode = 1;
}

// H4: Staff JWT passes staff gate (may still error after gate if secrets missing)
if (staff) {
  const r4 = await invokeFunction("alert-intelligence", staff);
  const h4 = r4.status !== 401 && r4.status !== 403;
  console.log(
    h4 ? "PASS" : "FAIL",
    "| staff fn + staff JWT passes gate (not 401/403)",
    "(got",
    r4.status + ")",
  );
  if (!h4) exitCode = 1;
} else {
  console.log(
    "SKIP | staff JWT smoke (set SECURITY_TEST_ACCESS_TOKEN_STAFF or SECURITY_TEST_STAFF_EMAIL + SECURITY_TEST_STAFF_PASSWORD)",
  );
}

// ── Plan-level feature gate regression tests ─────────────────────────────────
// These tests verify that pro-only functions (user-research, generate-insight)
// and starter-only functions (nl-search) reject free-tier users with 402
// PLAN_REQUIRED, not just a quota error.

// H5: nl-search rejects unauthenticated request → 401
const noAuthNl = await invokeFunction("nl-search");
if (noAuthNl.fetchError) {
  console.log("FAIL", "| network (nl-search)", noAuthNl.json?.fetchError);
  exitCode = 1;
} else {
  const h5 = noAuthNl.status === 401;
  console.log(h5 ? "PASS" : "FAIL", "| nl-search + no auth → 401", "(got", noAuthNl.status + ")");
  if (!h5) exitCode = 1;
}

// H6: generate-insight rejects unauthenticated request → 401
const noAuthGi = await invokeFunction("generate-insight");
if (noAuthGi.fetchError) {
  console.log("FAIL", "| network (generate-insight)", noAuthGi.json?.fetchError);
  exitCode = 1;
} else {
  const h6 = noAuthGi.status === 401;
  console.log(h6 ? "PASS" : "FAIL", "| generate-insight + no auth → 401", "(got", noAuthGi.status + ")");
  if (!h6) exitCode = 1;
}

// H7: user-research + free-tier JWT → 402 with PLAN_REQUIRED code
// (Only runnable if SECURITY_TEST_FREE_USER tokens are provided, since the
//  regular nonStaff token may be on any plan. Set SECURITY_TEST_FREE_ACCESS_TOKEN
//  or SECURITY_TEST_FREE_EMAIL + SECURITY_TEST_FREE_PASSWORD to a confirmed free user.)
const freeToken = process.env.SECURITY_TEST_FREE_ACCESS_TOKEN ||
  await (async () => {
    const email = process.env.SECURITY_TEST_FREE_EMAIL;
    const password = process.env.SECURITY_TEST_FREE_PASSWORD;
    if (!email || !password) return "";
    const sb = (await import("@supabase/supabase-js")).createClient(base, anon);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { console.error("[verify-edge-security] Free user sign-in failed:", error.message); return ""; }
    return data.session?.access_token ?? "";
  })();

if (freeToken) {
  const r7 = await invokeFunction("user-research", freeToken);
  const h7 = r7.status === 402 && String(JSON.stringify(r7.json)).includes("PLAN_REQUIRED");
  console.log(
    h7 ? "PASS" : "FAIL",
    "| user-research + free JWT → 402 PLAN_REQUIRED",
    "(got", r7.status, JSON.stringify(r7.json?.code ?? r7.json) + ")",
  );
  if (!h7) exitCode = 1;

  const r7b = await invokeFunction("generate-insight", freeToken);
  const h7b = r7b.status === 402 && String(JSON.stringify(r7b.json)).includes("PLAN_REQUIRED");
  console.log(
    h7b ? "PASS" : "FAIL",
    "| generate-insight + free JWT → 402 PLAN_REQUIRED",
    "(got", r7b.status, JSON.stringify(r7b.json?.code ?? r7b.json) + ")",
  );
  if (!h7b) exitCode = 1;

  const r7c = await invokeFunction("nl-search", freeToken);
  const h7c = r7c.status === 402 && String(JSON.stringify(r7c.json)).includes("PLAN_REQUIRED");
  console.log(
    h7c ? "PASS" : "FAIL",
    "| nl-search + free JWT → 402 PLAN_REQUIRED",
    "(got", r7c.status, JSON.stringify(r7c.json?.code ?? r7c.json) + ")",
  );
  if (!h7c) exitCode = 1;
} else {
  console.log(
    "SKIP | plan-gate rejection tests (set SECURITY_TEST_FREE_ACCESS_TOKEN or SECURITY_TEST_FREE_EMAIL + SECURITY_TEST_FREE_PASSWORD to a confirmed free-tier user)",
  );
}

// H8: Staff JWT bypasses plan gate on pro-only functions (may still 5xx if LLM key missing)
if (staff) {
  const r8 = await invokeFunction("user-research", staff);
  const h8 = r8.status !== 401 && r8.status !== 402 && r8.status !== 403;
  console.log(
    h8 ? "PASS" : "FAIL",
    "| user-research + staff JWT bypasses plan gate (not 401/402/403)",
    "(got", r8.status + ")",
  );
  if (!h8) exitCode = 1;

  const r8b = await invokeFunction("generate-insight", staff);
  const h8b = r8b.status !== 401 && r8b.status !== 402 && r8b.status !== 403;
  console.log(
    h8b ? "PASS" : "FAIL",
    "| generate-insight + staff JWT bypasses plan gate (not 401/402/403)",
    "(got", r8b.status + ")",
  );
  if (!h8b) exitCode = 1;
} else {
  console.log(
    "SKIP | staff bypass of plan gate (set SECURITY_TEST_ACCESS_TOKEN_STAFF or SECURITY_TEST_STAFF_EMAIL + SECURITY_TEST_STAFF_PASSWORD)",
  );
}

console.log("\n[verify-edge-security] Summary:", exitCode === 0 ? "ALL PASSED" : "FAILURES DETECTED");
process.exit(exitCode);
