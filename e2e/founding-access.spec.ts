import { test, expect } from "@playwright/test";

/**
 * Pre-launch founding-access flow on the public Pricing page.
 *
 * Payments aren't live (VITE_PAYMENTS_LIVE !== 'true'), so every plan CTA opens
 * the founding-access modal instead of a checkout. This runs WITHOUT auth or a
 * seeded backend — only the plan_interest insert is intercepted; the public
 * pricing reads (seat counters) are allowed to no-op/fail gracefully.
 *
 * Locks in the honest painted-door contract: click Reserve -> capture sentiment
 * + price + email -> POST /rest/v1/plan_interest -> founding-list confirmation.
 */

test("reserving a plan captures intent into plan_interest", async ({ page }) => {
  let inserted: Record<string, unknown> | null = null;

  await page.route("**/rest/v1/plan_interest*", async (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      inserted = Array.isArray(body) ? body[0] : body;
      await route.fulfill({ status: 201, json: [inserted] });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto("/pricing");

  // Pre-launch CTA wording.
  const reserveStarter = page.getByRole("button", { name: "Reserve founding price" }).first();
  await expect(reserveStarter).toBeVisible();
  await reserveStarter.click();

  // Modal opens for the chosen plan.
  await expect(page.getByText(/Reserve your .* plan/)).toBeVisible();

  // Pick sentiment, expected price, and email (anonymous visitor).
  await page.getByText("Maybe — keep me posted").click();
  await page.getByPlaceholder("e.g. 49").fill("49");
  await page.getByPlaceholder("you@company.com").fill("lead@acme.com");
  await page.getByRole("button", { name: "Reserve my spot" }).click();

  // Confirmation + the row we captured.
  await expect(page.getByText("You're on the founding list")).toBeVisible();
  expect(inserted).toMatchObject({
    sentiment: "maybe",
    expected_price: 49,
    email: "lead@acme.com",
    source: "pricing",
  });
});

test("the upgrade CTA reads 'Reserve founding price', not a checkout", async ({ page }) => {
  await page.route("**/rest/v1/plan_interest*", (route) => route.fulfill({ status: 201, json: [{}] }));
  await page.goto("/pricing");
  await expect(page.getByRole("button", { name: "Reserve founding price" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Subscribe/ })).toHaveCount(0);
});
