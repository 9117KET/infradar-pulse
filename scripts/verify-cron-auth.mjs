#!/usr/bin/env node
/**
 * verify-cron-auth.mjs
 *
 * Diagnoses (and optionally tests) the pg_cron -> Edge Function credential
 * path that went silent on 2026-07-22.
 *
 * Usage:
 *   node scripts/verify-cron-auth.mjs                      # local stack
 *   node scripts/verify-cron-auth.mjs --db-url "postgres://..."   # any DB
 *   SUPABASE_DB_URL=postgres://... node scripts/verify-cron-auth.mjs
 *   node scripts/verify-cron-auth.mjs --db-url ... --run-tests
 *
 * Default behaviour is READ-ONLY: it only runs SELECTs. Pass --run-tests to
 * also execute supabase/tests/cron_auth_vault.test.sql, which is wrapped in
 * BEGIN/ROLLBACK and therefore leaves no trace - but it is opt-in against a
 * non-local database so nobody runs it on prod by accident.
 *
 * Exit codes:
 *   0  healthy
 *   1  a real problem (baked credentials, unusable key, or failing tests)
 *   2  could not connect / no psql available
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const TEST_FILE = join(repoRoot, "supabase", "tests", "cron_auth_vault.test.sql");

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const dbUrl = opt("--db-url") || process.env.SUPABASE_DB_URL || LOCAL_URL;
const isLocal = dbUrl === LOCAL_URL || /(?:127\.0\.0\.1|localhost):54322/.test(dbUrl);
const runTests = flag("--run-tests") || isLocal;

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// --------------------------------------------------------------------------
// psql discovery: prefer a real client, fall back to the local Supabase
// container so this works on a machine that only has Docker.
// --------------------------------------------------------------------------
function findPsql() {
  try {
    execSync("psql --version", { stdio: "ignore" });
    return { kind: "native" };
  } catch {
    /* fall through */
  }
  try {
    const names = execSync("docker ps --format {{.Names}}", { encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => /^supabase_db_/.test(s));
    if (names.length > 0) return { kind: "docker", container: names[0] };
  } catch {
    /* fall through */
  }
  return null;
}

const psql = findPsql();
if (!psql) {
  console.error(
    red("No psql client found."),
    "\nInstall the PostgreSQL client, or start the local stack (npm run sb:start)",
    "\nso this script can borrow psql from the supabase_db_* container.",
  );
  process.exit(2);
}

/**
 * Runs SQL and returns stdout+stderr combined. Combining matters: psql sends
 * RAISE NOTICE - which is how the test suite reports every assertion - to
 * stderr, so a stdout-only capture sees an empty, apparently-failing run.
 * Throws with the combined output attached when psql exits non-zero.
 */
function runSql({ sql, file, quiet = false }) {
  const base = ["-v", "ON_ERROR_STOP=1", "-X"];
  const io = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  const input = file ? readFileSync(file, "utf8") : sql;

  let cmd, a;
  if (psql.kind === "native") {
    cmd = "psql";
    a = [dbUrl, ...base];
  } else {
    // Docker path. When the target IS this container's own database, connect
    // over its local socket - the host-side 127.0.0.1:54322 mapping does not
    // exist inside the container.
    cmd = "docker";
    a = ["exec", "-i", psql.container, "psql",
         ...(isLocal ? ["-U", "postgres", "-d", "postgres"] : [dbUrl]), ...base];
  }
  if (quiet) a.push("-q");
  // Scalar diagnostic queries: unaligned, tuples-only output so the result
  // parses as a bare value with no header or row-count noise.
  if (!file) a.push("-t", "-A");
  a.push("-f", "-"); // read from stdin in both paths, so no file mount needed

  const r = spawnSync(cmd, a, { ...io, input });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0) {
    const err = new Error(`psql exited ${r.status}`);
    err.output = out;
    throw err;
  }
  return out;
}

// --------------------------------------------------------------------------
console.log(bold("\nInfraRadar cron credential check"));
console.log(`  target : ${isLocal ? "local stack" : dbUrl.replace(/:[^:@/]*@/, ":****@")}`);
console.log(`  psql   : ${psql.kind === "native" ? "native" : `docker (${psql.container})`}`);
console.log(`  tests  : ${runTests ? "yes" : "no (pass --run-tests to enable)"}\n`);

let failed = false;

// --- 1. Does the fix exist on this database at all? ------------------------
let installed;
try {
  installed = runSql({
    quiet: true,
    sql: `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname IN
            ('cron_auth_preflight','cron_jobs_with_baked_credentials','rewrite_cron_baked_credentials');`,
  });
} catch (e) {
  console.error(red("Could not connect to the database."));
  console.error(String(e.output || e.message).trim());
  process.exit(2);
}

const fnCount = Number((installed.match(/\d+/) || [0])[0]);
if (fnCount < 3) {
  console.log(
    yellow(`! migration not applied here (${fnCount}/3 helper functions present)`),
  );
  console.log("  Apply it with: npm run sb:db:push\n");
  failed = true;
} else {
  console.log(green("✓ migration present (3/3 helper functions)"));
}

// --- 2. Live diagnosis ------------------------------------------------------
if (fnCount === 3) {
  const preflight = runSql({
    quiet: true,
    sql: "SELECT ok::text || '|' || detail FROM public.cron_auth_preflight();",
  });
  const [okStr, ...rest] = preflight.trim().split("\n")[0].trim().split("|");
  const keyOk = okStr.trim() === "true";
  const detail = rest.join("|");
  // A local stack legitimately has no service-role key in vault (the hosted
  // cron migrations skip themselves there), so this is only a hard failure
  // against a real database.
  if (keyOk) {
    console.log(green(`✓ service key: ${detail}`));
  } else if (isLocal) {
    console.log(yellow(`! service key: ${detail} (expected on a local stack)`));
  } else {
    console.log(red(`✗ service key: ${detail}`));
    failed = true;
  }

  const baked = runSql({
    quiet: true,
    sql: "SELECT COALESCE(string_agg(jobname, ', '), '') FROM public.cron_jobs_with_baked_credentials();",
  }).trim().split("\n")[0].trim();

  if (baked) {
    console.log(red(`✗ jobs with baked credentials: ${baked}`));
    console.log("  Fix: SELECT * FROM public.rewrite_cron_baked_credentials();");
    failed = true;
  } else {
    console.log(green("✓ no job carries a literal bearer token"));
  }
}

// --- 3. Are the agents actually running? -----------------------------------
// This is the outcome the heartbeat reports on. Reported for both local and
// prod, but only treated as a failure on a non-local database, since a local
// stack legitimately has no agent history.
try {
  const silence = runSql({
    quiet: true,
    sql: `SELECT COALESCE(round(EXTRACT(epoch FROM (now() - max(last_run_at)))/3600, 1)::text, 'never')
          FROM agent_config WHERE enabled AND last_run_at IS NOT NULL;`,
  }).trim().split("\n")[0].trim();

  if (silence === "never" || silence === "") {
    console.log(yellow("! no enabled agent has ever recorded a run"));
    if (!isLocal) failed = true;
  } else {
    const hours = Number(silence);
    const msg = `last agent run: ${hours}h ago`;
    if (hours >= 2) {
      console.log(isLocal ? yellow(`! ${msg}`) : red(`✗ ${msg} (heartbeat threshold is 2h)`));
      if (!isLocal) failed = true;
    } else {
      console.log(green(`✓ ${msg}`));
    }
  }
} catch {
  console.log(yellow("! could not read agent_config"));
}

// --- 4. Recent HTTP failures pg_cron hides ---------------------------------
try {
  const fails = runSql({
    quiet: true,
    sql: `SELECT count(*) FROM public.cron_http_failures WHERE created > now() - interval '24 hours';`,
  }).trim().split("\n")[0].trim();
  const n = Number(fails);
  if (Number.isFinite(n) && n > 0) {
    console.log(yellow(`! ${n} failed outbound HTTP call(s) in the last 24h`));
    console.log("  Inspect: SELECT * FROM public.cron_http_failures LIMIT 20;");
  } else {
    console.log(green("✓ no failed outbound HTTP calls in the last 24h"));
  }
} catch {
  console.log(yellow("! cron_http_failures view unavailable (pg_net not exposed)"));
}

// --- 5. Test suite ---------------------------------------------------------
if (runTests) {
  if (!existsSync(TEST_FILE)) {
    console.log(red(`\n✗ test file missing: ${TEST_FILE}`));
    failed = true;
  } else {
    console.log(bold("\nRunning test suite (transactional, rolled back)..."));
    try {
      const out = runSql({ file: TEST_FILE });
      const passed = (out.match(/ok - /g) || []).length;
      if (/ALL CRON AUTH TESTS PASSED/.test(out)) {
        console.log(green(`✓ ${passed} assertions passed`));
      } else {
        console.log(red("✗ test suite did not reach the success marker"));
        failed = true;
      }
    } catch (e) {
      const err = String(e.output || e.message || "");
      const assertion = err.match(/ASSERTION FAILED: .*/);
      console.log(red(`✗ ${assertion ? assertion[0] : "test suite failed"}`));
      if (!assertion) console.log(err.trim().split("\n").slice(-10).join("\n"));
      failed = true;
    }
  }
}

console.log();
if (failed) {
  console.log(red(bold("RESULT: problems found (see above)")));
  process.exit(1);
}
console.log(green(bold("RESULT: cron credential path healthy")));
