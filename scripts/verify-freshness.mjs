#!/usr/bin/env node
/**
 * verify-freshness.mjs — READ-ONLY.
 *
 * Quantifies the freshness-scoring defect against a real database and shows
 * what the fix changes. Runs only SELECTs; it never writes, and is safe to
 * point at production.
 *
 *   node scripts/verify-freshness.mjs                       # local stack
 *   SUPABASE_DB_URL='postgres://...' node scripts/verify-freshness.mjs
 *   node scripts/verify-freshness.mjs --db-url 'postgres://...'
 *
 * THE DEFECT
 *   Both edge call sites passed `lastUpdated: new Date()` to the scorer, and
 *   the scorer defaulted a missing date to Date.now(). So freshness_score was
 *   pinned at 100 for every row ever written: the ageDays tiers were
 *   unreachable and `stale_record` could not be raised from the ingest path.
 *   Freshness was not a signal, it was a fixed 10-point offset.
 *
 * WHAT "PASS" MEANS HERE
 *   On a database written by the OLD code, a 100%-at-100 distribution is the
 *   defect being confirmed, not a failure of this script. After the fix ships
 *   and new rows are written, the distribution should spread out.
 *
 * Exit codes: 0 ok · 1 defect confirmed in stored data · 2 cannot connect
 */

import { execSync, spawnSync } from "node:child_process";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const args = process.argv.slice(2);
const optOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dbUrl = optOf("--db-url") || process.env.SUPABASE_DB_URL || LOCAL_URL;
const isLocal = dbUrl === LOCAL_URL || /(?:127\.0\.0\.1|localhost):54322/.test(dbUrl);

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function findPsql() {
  try { execSync("psql --version", { stdio: "ignore" }); return { kind: "native" }; } catch { /* next */ }
  try {
    const n = execSync("docker ps --format {{.Names}}", { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter((s) => /^supabase_db_/.test(s));
    if (n.length) return { kind: "docker", container: n[0] };
  } catch { /* none */ }
  return null;
}
const psql = findPsql();
if (!psql) {
  console.error(red("No psql client found. Install it, or start the local stack (npm run sb:start)."));
  process.exit(2);
}

/** Runs one read-only statement and returns rows as arrays of strings. */
function q(sql) {
  // -A -t gives unaligned, header-less rows; fields are pipe-separated.
  // Read-only is enforced via PGOPTIONS rather than a leading SET statement,
  // because SET emits a "SET" command tag that would parse as a data row.
  const base = ["-v", "ON_ERROR_STOP=1", "-X", "-t", "-A", "-c", sql];
  const RO = "-c default_transaction_read_only=on";

  const cmd = psql.kind === "native" ? "psql" : "docker";
  const a = psql.kind === "native"
    ? [dbUrl, ...base]
    : ["exec", "-i", "-e", `PGOPTIONS=${RO}`, psql.container, "psql",
       ...(isLocal ? ["-U", "postgres", "-d", "postgres"] : [dbUrl]), ...base];

  const r = spawnSync(cmd, a, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: psql.kind === "native" ? { ...process.env, PGOPTIONS: RO } : process.env,
  });
  if (r.status !== 0) {
    const err = new Error("query failed");
    err.detail = ((r.stdout || "") + (r.stderr || "")).trim();
    throw err;
  }
  return (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).map((l) => l.split("|"));
}

function bar(n, max, width = 26) {
  if (!max) return "";
  return "█".repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)));
}

console.log(bold("\nFreshness scoring — stored vs. actual"));
console.log(`  target : ${isLocal ? "local stack" : dbUrl.replace(/:[^:@/]*@/, ":****@")}`);
console.log(dim("  mode   : read-only (SELECT only, transaction forced read-only)\n"));

let rows;
try {
  rows = q("SELECT count(*) FROM quality_scores;");
} catch (e) {
  console.error(red("Could not query quality_scores."));
  console.error(dim(e.detail || e.message));
  process.exit(2);
}

const total = Number(rows[0]?.[0] ?? 0);
if (!total) {
  console.log(yellow("! quality_scores is empty — nothing to measure here."));
  console.log(dim("  Expected on a fresh local stack. Point at production with --db-url.\n"));
  process.exit(0);
}
console.log(`${bold("Stored rows:")} ${total.toLocaleString()}\n`);

// ---- 1. What is actually stored -------------------------------------------
console.log(bold("Stored freshness_score distribution"));
const dist = q(`SELECT freshness_score, count(*) FROM quality_scores
                GROUP BY 1 ORDER BY 1 DESC;`);
const maxD = Math.max(...dist.map((r) => Number(r[1])));
for (const [score, n] of dist) {
  const pct = ((Number(n) / total) * 100).toFixed(1);
  console.log(`  ${String(score).padStart(3)} ${bar(Number(n), maxD).padEnd(27)} ${String(n).padStart(7)}  ${pct.padStart(5)}%`);
}

const pinned = dist.length === 1 && String(dist[0][0]) === "100";
console.log(pinned
  ? red("\n  ✗ every stored row scores exactly 100 — freshness is a constant, not a signal")
  : green("\n  ✓ stored freshness scores vary"));

// ---- 2. What the real dates say -------------------------------------------
console.log(bold("\nActual age of the linked projects"));
let real = [];
try {
  real = q(`
    SELECT CASE
             WHEN p.last_updated IS NULL                                THEN '5 unknown'
             WHEN p.last_updated > now() + interval '1 day'             THEN '6 future (data error)'
             WHEN now() - p.last_updated > interval '180 days'          THEN '4 stale  >180d'
             WHEN now() - p.last_updated > interval  '90 days'          THEN '3 aging  91-180d'
             WHEN now() - p.last_updated > interval  '30 days'          THEN '2 recent 31-90d'
             ELSE                                                            '1 fresh  <=30d'
           END AS band,
           count(*)
    FROM quality_scores q
    JOIN projects p ON p.id = q.project_id
    GROUP BY 1 ORDER BY 1;`);
} catch (e) {
  console.log(yellow("  ! could not join quality_scores to projects"));
  console.log(dim("    " + (e.detail || e.message).split("\n")[0]));
}

if (real.length) {
  const linked = real.reduce((a, r) => a + Number(r[1]), 0);
  const maxR = Math.max(...real.map((r) => Number(r[1])));
  const SCORE = { "1": 100, "2": 70, "3": 45, "4": 20, "5": 45, "6": 45 };
  let weighted = 0;
  for (const [band, n] of real) {
    const key = band.slice(0, 1);
    const label = band.slice(2);
    const pct = ((Number(n) / linked) * 100).toFixed(1);
    const colour = key === "1" ? green : key === "4" || key === "6" ? red : yellow;
    console.log(`  ${colour(label.padEnd(20))} ${bar(Number(n), maxR).padEnd(27)} ${String(n).padStart(7)}  ${pct.padStart(5)}%  ${dim("→ scores " + SCORE[key])}`);
    weighted += SCORE[key] * Number(n);
  }
  const corrected = weighted / linked;
  console.log(`\n  stored average freshness    ${bold("100.0")}`);
  console.log(`  corrected average freshness ${bold(corrected.toFixed(1))}`);
  const delta = ((100 - corrected) * 0.10).toFixed(1);
  console.log(dim(`  freshness carries 10% weight → mean total_score falls ~${delta} points once real dates are used`));
} else {
  console.log(dim("  (no project-linked rows)"));
}

// ---- 3. Flags that could never fire ---------------------------------------
console.log(bold("\nFlags raised in stored rows"));
try {
  const flags = q(`SELECT f, count(*) FROM quality_scores q,
                   LATERAL unnest(COALESCE(q.flags, '{}')) AS f
                   GROUP BY 1 ORDER BY 2 DESC LIMIT 8;`);
  if (!flags.length) console.log(dim("  (none)"));
  for (const [f, n] of flags) console.log(`  ${String(f).padEnd(28)} ${String(n).padStart(7)}`);
  const hasStale = flags.some((r) => r[0] === "stale_record");
  console.log(hasStale
    ? green("\n  ✓ stale_record appears in stored data")
    : red("\n  ✗ stale_record never appears — unreachable while freshness is pinned at 100"));
} catch (e) {
  console.log(dim("  could not read flags: " + (e.detail || e.message).split("\n")[0]));
}

console.log();
if (pinned) {
  console.log(red(bold("RESULT: defect confirmed in stored data")));
  console.log(dim("Rows written before the fix keep their pinned score; the correction applies to"));
  console.log(dim("rows written from here on. Backfilling old rows is a separate decision.\n"));
  process.exit(1);
}
console.log(green(bold("RESULT: freshness varies as expected\n")));
