import { test, expect } from "./fixtures/auth";

/**
 * Referral-driven usage-credit surface (logged-in free user).
 *
 * Requires the seeded local stack (npm run sb:seed-security-test-users) with the
 * dev server pointed at it, like the other authenticated specs. The two
 * referral-specific reads are intercepted so the assertions don't depend on the
 * test user actually having referrals — everything else hits the real backend:
 *   - GET  /rest/v1/referral_codes   -> a fixed code so the share link renders
 *   - POST /rest/v1/rpc/my_referral_summary -> the qualified/bonus numbers
 *
 * Locks in the contract between useEntitlements + ReferralDashboardCard and the
 * my_referral_summary RPC added in migration 20260615120000_referral_bonus.sql.
 */

const CODE = "ABC123";

async function mockReferral(
  page: import("@playwright/test").Page,
  summary: { qualified_count: number; pending_count: number; ai_bonus: number; welcome_bonus: number },
) {
  await page.route("**/rest/v1/referral_codes**", async (route) => {
    await route.fulfill({ json: [{ code: CODE }] });
  });
  await page.route("**/rest/v1/rpc/my_referral_summary", async (route) => {
    // RPC returning a TABLE serialises as an array of rows.
    await route.fulfill({ json: [summary] });
  });
}

test("free user sees their share link and current +0/day bonus", async ({ asUser }) => {
  await mockReferral(asUser, { qualified_count: 0, pending_count: 0, ai_bonus: 0, welcome_bonus: 0 });

  await asUser.goto("/dashboard");

  await expect(asUser.getByText("Earn more daily AI queries")).toBeVisible();
  await expect(asUser.getByDisplayValue(`https://infradarai.com?ref=${CODE}`)).toBeVisible();
  await expect(asUser.getByText("+0/day")).toBeVisible();
});

test("the earned bonus and qualified count reflect the summary RPC", async ({ asUser }) => {
  await mockReferral(asUser, { qualified_count: 3, pending_count: 1, ai_bonus: 9, welcome_bonus: 0 });

  await asUser.goto("/dashboard");

  await expect(asUser.getByText("+9/day")).toBeVisible();
  await expect(asUser.getByText("3", { exact: true })).toBeVisible(); // qualified count
});

test("the bonus is marked maxed at the +30/day cap", async ({ asUser }) => {
  await mockReferral(asUser, { qualified_count: 50, pending_count: 0, ai_bonus: 30, welcome_bonus: 0 });

  await asUser.goto("/dashboard");

  await expect(asUser.getByText("+30/day (max)")).toBeVisible();
});

test("copying the share link confirms with a toast", async ({ asUser }) => {
  await mockReferral(asUser, { qualified_count: 0, pending_count: 0, ai_bonus: 0, welcome_bonus: 0 });

  await asUser.goto("/dashboard");
  await asUser.getByRole("button", { name: "Copy referral link" }).click();

  await expect(asUser.getByText("Referral link copied to clipboard.")).toBeVisible();
});
