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

function getSupabaseBin() {
  const win = process.platform === "win32";
  const name = win ? "supabase.cmd" : "supabase";
  const p = join(projectRoot, "node_modules", ".bin", name);
  if (existsSync(p)) return p;
  return null;
}

function loadLocalStatus() {
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

  const admin = createClient(url, serviceKey);
  const { error: upErr } = await admin.from("user_roles").update({ role: "admin" }).eq("user_id", staffId);
  if (upErr) {
    console.error("Could not set staff role to admin:", upErr.message);
    process.exit(1);
  }

  console.log("");
  console.log("Copy into .env (local dev only; do not commit):");
  console.log("");
  console.log(`SECURITY_TEST_USER_EMAIL=${USER_EMAIL}`);
  console.log(`SECURITY_TEST_USER_PASSWORD=${USER_PASSWORD}`);
  console.log(`SECURITY_TEST_STAFF_EMAIL=${STAFF_EMAIL}`);
  console.log(`SECURITY_TEST_STAFF_PASSWORD=${STAFF_PASSWORD}`);
  console.log("");
  console.log(`User ids: user=${userId}, staff=${staffId} (staff role set to admin in user_roles)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
