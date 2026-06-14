/**
 * Creates local-only test accounts for npm run test:edge-security.
 * Requires: Docker + supabase start. Uses service role from `supabase status -o json`.
 *
 * Idempotent: if users exist, signs in and ensures staff has admin role.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");

const USER_EMAIL = process.env.SECURITY_TEST_USER_EMAIL || "security-test-user@infradar.local";
const USER_PASSWORD = process.env.SECURITY_TEST_USER_PASSWORD || "SecurityTest_User_01!";
const STAFF_EMAIL = process.env.SECURITY_TEST_STAFF_EMAIL || "security-test-staff@infradar.local";
const STAFF_PASSWORD = process.env.SECURITY_TEST_STAFF_PASSWORD || "SecurityTest_Staff_01!";
// Non-staff paid user: proves the plan-gate/quota "allow" path for real customers
// (staff bypass everything, so they can't prove a Pro user is *let through*).
const PRO_EMAIL = process.env.SECURITY_TEST_PRO_EMAIL || "security-test-pro@infradar.local";
const PRO_PASSWORD = process.env.SECURITY_TEST_PRO_PASSWORD || "SecurityTest_Pro_01!";
// Dedicated free-tier user for HTTP gate/quota tests. IMPORTANT: only ever sign
// in via the API (signInWithPassword) — logging in through the app UI triggers
// AuthContext's claim_own_pilot_access, which grants 30-day enterprise pilot
// access and would no longer resolve as "free". We also clear any grants below.
const FREE_EMAIL = process.env.SECURITY_TEST_FREE_EMAIL || "security-test-free@infradar.local";
const FREE_PASSWORD = process.env.SECURITY_TEST_FREE_PASSWORD || "SecurityTest_Free_01!";

function getSupabaseBin() {
  const win = process.platform === "win32";
  const name = win ? "supabase.cmd" : "supabase";
  const p = join(projectRoot, "node_modules", ".bin", name);
  if (existsSync(p)) return p;
  return null;
}

function loadLocalStatus() {
  // Fast path: explicit env vars (CI-friendly, and avoids a Windows EINVAL when
  // execFileSync tries to spawn supabase.cmd). Get these from `supabase status`.
  const envUrl = process.env.LOCAL_SUPABASE_URL || process.env.SUPABASE_URL;
  const envAnon = process.env.LOCAL_SUPABASE_ANON_KEY || process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
  const envService = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envAnon && envService) {
    return { API_URL: envUrl, PUBLISHABLE_KEY: envAnon, SERVICE_ROLE_KEY: envService };
  }

  const bin = getSupabaseBin();
  if (!bin) {
    console.error("Run from infradar-pulse with devDependencies installed (supabase CLI in node_modules/.bin).");
    process.exit(1);
  }
  let raw;
  try {
    raw = execFileSync(bin, ["status", "-o", "json"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    console.error("Is `supabase start` running? Failed:", e?.message || e);
    process.exit(1);
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    console.error("Could not parse supabase status JSON:\n", raw.slice(0, 500));
    process.exit(1);
  }
  return JSON.parse(m[0]);
}

async function ensureUser(anonClient, email, password) {
  const signUp = await anonClient.auth.signUp({ email, password });
  if (signUp.error && signUp.error.message?.includes("already registered")) {
    const inRes = await anonClient.auth.signInWithPassword({ email, password });
    if (inRes.error) {
      console.error(`Sign-in failed for ${email}:`, inRes.error.message);
      process.exit(1);
    }
    return inRes.data.user?.id;
  }
  if (signUp.error) {
    console.error(`Sign-up failed for ${email}:`, signUp.error.message);
    process.exit(1);
  }
  return signUp.data.user?.id;
}

async function main() {
  const status = loadLocalStatus();
  const url = status.API_URL || "http://127.0.0.1:54321";
  const anon = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceKey = status.SERVICE_ROLE_KEY;
  if (!anon || !serviceKey) {
    console.error("status JSON missing PUBLISHABLE_KEY / SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const anonClient = createClient(url, anon);

  console.log("Creating or linking test users (local only)…");
  const userId = await ensureUser(anonClient, USER_EMAIL, USER_PASSWORD);
  const staffId = await ensureUser(anonClient, STAFF_EMAIL, STAFF_PASSWORD);
  const proId = await ensureUser(anonClient, PRO_EMAIL, PRO_PASSWORD);
  const freeId = await ensureUser(anonClient, FREE_EMAIL, FREE_PASSWORD);

  const admin = createClient(url, serviceKey);
  // Add the admin role idempotently. Users can hold multiple roles (unique on
  // user_id+role), and hasStaffBypass only checks membership — so we insert an
  // 'admin' row rather than mutating the auto-created 'user' row (which would
  // collide with the unique constraint if admin already exists).
  const { error: upErr } = await admin
    .from("user_roles")
    .upsert({ user_id: staffId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
  if (upErr) {
    console.error("Could not grant staff admin role:", upErr.message);
    process.exit(1);
  }

  // Give the Pro user an active Pro subscription in the "live" environment
  // (entitlement resolution defaults to "live"; see _shared/entitlementCheck.ts).
  // Paddle columns are NOT NULL with no default, so fill them with local-only
  // placeholders. effectivePlan() resolves status=active + plan_key=pro → "pro".
  // Idempotent without assuming a specific unique constraint: clear any prior
  // local-test row for this user+env, then insert a fresh active Pro row.
  await admin.from("subscriptions").delete().eq("user_id", proId).eq("environment", "live");
  const { error: subErr } = await admin.from("subscriptions").insert({
    user_id: proId,
    environment: "live",
    status: "active",
    plan_key: "pro",
    paddle_customer_id: "ctm_local_test_pro",
    paddle_subscription_id: "sub_local_test_pro",
    price_id: "pro_monthly",
    product_id: "prod_local_test_pro",
  });
  if (subErr) {
    console.error("Could not seed Pro subscription:", subErr.message);
    process.exit(1);
  }

  // Keep the free user deterministically free: clear any pilot/trial/lifetime
  // grants (e.g. from a previous UI login that claimed pilot access).
  for (const tbl of ["pilot_access_grants", "no_card_trial_grants", "lifetime_grants"]) {
    const { error } = await admin.from(tbl).delete().eq("user_id", freeId);
    if (error) console.warn(`Could not clear ${tbl} for free user:`, error.message);
  }
  // The free user must have no subscription either.
  await admin.from("subscriptions").delete().eq("user_id", freeId);

  // Mark test users onboarded so login lands on /dashboard (DashboardLayout
  // redirects un-onboarded users to /onboarding, which would break E2E flows).
  const { error: onbErr } = await admin
    .from("profiles")
    .update({ onboarded: true })
    .in("id", [userId, staffId, proId, freeId]);
  if (onbErr) console.warn("Could not mark test users onboarded:", onbErr.message);

  console.log("");
  console.log("Copy into .env (local dev only; do not commit):");
  console.log("");
  console.log(`SECURITY_TEST_USER_EMAIL=${USER_EMAIL}`);
  console.log(`SECURITY_TEST_USER_PASSWORD=${USER_PASSWORD}`);
  console.log(`SECURITY_TEST_STAFF_EMAIL=${STAFF_EMAIL}`);
  console.log(`SECURITY_TEST_STAFF_PASSWORD=${STAFF_PASSWORD}`);
  // Dedicated free-tier user (no grants, no subscription). Use ONLY via API in
  // gate/quota tests — never log it in through the UI (that claims pilot access).
  console.log(`SECURITY_TEST_FREE_EMAIL=${FREE_EMAIL}`);
  console.log(`SECURITY_TEST_FREE_PASSWORD=${FREE_PASSWORD}`);
  console.log(`SECURITY_TEST_PRO_EMAIL=${PRO_EMAIL}`);
  console.log(`SECURITY_TEST_PRO_PASSWORD=${PRO_PASSWORD}`);
  console.log("");
  console.log(`User ids: user=${userId}, staff=${staffId} (admin), pro=${proId} (active Pro sub), free=${freeId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
