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

process.exit(exitCode);
