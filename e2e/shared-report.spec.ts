import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Public shared-report page (/r/:token). The app must point at the same backend
 * the seed data lives in (local stack: start dev with VITE_SUPABASE_URL set local).
 *
 * The valid-render test seeds a report + share directly via the service role and
 * is skipped unless LOCAL_SUPABASE_SERVICE_ROLE_KEY + the local URL/anon key are set.
 */
const SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const SB_URL = process.env.LOCAL_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const SB_ANON = process.env.LOCAL_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PRO_EMAIL = process.env.SECURITY_TEST_PRO_EMAIL || "security-test-pro@infradar.local";
const PRO_PASSWORD = process.env.SECURITY_TEST_PRO_PASSWORD || "SecurityTest_Pro_01!";

test.describe("Public shared report", () => {
  test("invalid token shows 'not available'", async ({ page }) => {
    await page.goto("/r/thistokendoesnotexist0000000000");
    await expect(page.getByText(/Report not available/i)).toBeVisible({ timeout: 10_000 });
  });

  test("valid token renders the report read-only", async ({ page }) => {
    test.skip(!SERVICE_KEY || !SB_ANON, "set LOCAL_SUPABASE_SERVICE_ROLE_KEY + anon key to run");

    // Seed a completed report + share via service role; capture the token.
    const admin = createClient(SB_URL, SERVICE_KEY!);
    const userClient = createClient(SB_URL, SB_ANON!);
    const { data: signin } = await userClient.auth.signInWithPassword({ email: PRO_EMAIL, password: PRO_PASSWORD });
    const proId = signin?.user?.id;
    expect(proId, "pro user must exist (run sb:seed-security-test-users)").toBeTruthy();

    const { data: rr } = await admin
      .from("report_runs")
      .insert({ user_id: proId, report_type: "share_test_e2e", status: "completed", title: "E2E Shared Report", markdown: "# E2E heading\n\nUnique-body-marker-42." })
      .select("id")
      .single();
    const { data: share } = await admin
      .from("report_shares")
      .insert({ report_run_id: rr!.id, created_by: proId })
      .select("token")
      .single();

    try {
      await page.goto(`/r/${share!.token}`);
      await expect(page.getByRole("heading", { name: /E2E Shared Report/ })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Unique-body-marker-42/)).toBeVisible();
      await expect(page.getByRole("link", { name: /Start free/i }).first()).toBeVisible();
    } finally {
      await admin.from("report_runs").delete().eq("id", rr!.id);
    }
  });
});
