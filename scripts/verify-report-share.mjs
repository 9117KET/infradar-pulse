/**
 * Security verification for shareable public report links.
 * Run against a local stack with seeded users (see seed-security-test-users.mjs).
 *
 *   S1  Owner can create a share token for their own report.
 *   S2  Anonymous (publishable key) can resolve a valid token → report content.
 *   S3  A non-owner CANNOT create a share for someone else's report (NOT_OWNER).
 *   S4  Anonymous gets nothing for a bogus token.
 *   S5  After the owner revokes, the token resolves to nothing.
 *
 * Env: EDGE_SECURITY_BASE_URL / EDGE_SECURITY_ANON_KEY,
 *      LOCAL_SUPABASE_SERVICE_ROLE_KEY, SECURITY_TEST_PRO_*, SECURITY_TEST_FREE_*.
 */
import { createClient } from "@supabase/supabase-js";

const base = (process.env.EDGE_SECURITY_BASE_URL || process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
const anon = process.env.EDGE_SECURITY_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let exitCode = 0;
const check = (ok, label, detail = "") => { console.log(ok ? "PASS" : "FAIL", "|", label, detail); if (!ok) exitCode = 1; };
const die = (m) => { console.error("[verify-report-share]", m); process.exit(1); };
if (!anon || !serviceKey) die("Need EDGE_SECURITY_ANON_KEY + LOCAL_SUPABASE_SERVICE_ROLE_KEY.");

async function signIn(email, password) {
  const sb = createClient(base, anon);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) die(`sign-in failed for ${email}: ${error.message}`);
  return sb; // authenticated client
}

const admin = createClient(base, serviceKey);
const proClient = await signIn(process.env.SECURITY_TEST_PRO_EMAIL, process.env.SECURITY_TEST_PRO_PASSWORD);
const { data: proUser } = await proClient.auth.getUser();
const proId = proUser?.user?.id;
const freeClient = await signIn(process.env.SECURITY_TEST_FREE_EMAIL, process.env.SECURITY_TEST_FREE_PASSWORD);
const anonClient = createClient(base, anon);

// Seed a completed report owned by the Pro user.
await admin.from("report_shares").delete().eq("created_by", proId);
await admin.from("report_runs").delete().eq("user_id", proId).eq("report_type", "share_test");
const { data: rr, error: rrErr } = await admin
  .from("report_runs")
  .insert({ user_id: proId, report_type: "share_test", status: "completed", title: "Shared Report Test", markdown: "# Hello\n\nThis is a shared report." })
  .select("id")
  .single();
if (rrErr) die(`could not seed report_run: ${rrErr.message}`);
const reportId = rr.id;

// S1: owner creates a share token
const { data: token, error: csErr } = await proClient.rpc("create_report_share", { p_report_run_id: reportId });
check(!csErr && typeof token === "string" && token.length >= 16, "S1 owner creates share token", csErr ? `(err ${csErr.message})` : `(token len ${String(token).length})`);

// S2: anonymous resolves the token to report content
const { data: shared } = await anonClient.rpc("get_shared_report", { p_token: token });
const row = Array.isArray(shared) ? shared[0] : shared;
check(!!row && row.markdown?.includes("shared report"), "S2 anon resolves valid token → content", `(title=${row?.title ?? "none"})`);

// S3: a non-owner cannot create a share for this report
const { error: nonOwnerErr } = await freeClient.rpc("create_report_share", { p_report_run_id: reportId });
check(!!nonOwnerErr, "S3 non-owner cannot create share (rejected)", nonOwnerErr ? `(err ${nonOwnerErr.message})` : "(NO ERROR — leak!)");

// S4: bogus token resolves to nothing
const { data: bogus } = await anonClient.rpc("get_shared_report", { p_token: "deadbeefdeadbeefdeadbeefdeadbeef" });
check((Array.isArray(bogus) ? bogus.length : bogus) ? false : true, "S4 anon gets nothing for bogus token", `(rows=${Array.isArray(bogus) ? bogus.length : bogus ? 1 : 0})`);

// S5: after revoke, the token stops resolving
await proClient.rpc("revoke_report_share", { p_report_run_id: reportId });
const { data: afterRevoke } = await anonClient.rpc("get_shared_report", { p_token: token });
check((Array.isArray(afterRevoke) ? afterRevoke.length : afterRevoke) ? false : true, "S5 revoked token resolves to nothing", `(rows=${Array.isArray(afterRevoke) ? afterRevoke.length : afterRevoke ? 1 : 0})`);

// cleanup
await admin.from("report_runs").delete().eq("id", reportId);

console.log("\n[verify-report-share] Summary:", exitCode === 0 ? "ALL PASSED" : "FAILURES DETECTED");
process.exit(exitCode);
