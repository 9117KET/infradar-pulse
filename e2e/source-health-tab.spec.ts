/**
 * Source Health moved from its own route into a Review Queue tab.
 *
 * Verifies the three things that merge can break:
 *   1. the retired /dashboard/source-health route still resolves for anyone
 *      holding an old link or bookmark
 *   2. the tab actually renders its content rather than an empty panel
 *   3. the page has exactly one <h1> - SourceHealth carried its own heading and
 *      its own <Seo> when it was standalone, and leaving those in place would
 *      have produced a duplicate heading and two components fighting over the
 *      document title
 */
import { test, expect } from "@playwright/test";
import { login } from "./fixtures/auth";

test.describe("Source Health as a Review Queue tab", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "staff");
  });

  test("the old route redirects onto the tab", async ({ page }) => {
    await page.goto("/dashboard/source-health");
    await expect(page).toHaveURL(/\/dashboard\/review\?tab=source-health/);
  });

  test("the tab renders Source Health content", async ({ page }) => {
    await page.goto("/dashboard/review?tab=source-health");

    // The tab's own controls, not just the trigger label.
    await expect(page.getByRole("tab", { name: "Source Health" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(
      page.getByText("Validate every source URL surfaced by agents", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Total checked", { exact: false })).toBeVisible();
  });

  test("does not double up the page heading", async ({ page }) => {
    await page.goto("/dashboard/review?tab=source-health");
    await expect(page.getByRole("tab", { name: "Source Health" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("Review Queue");
  });

  test("selecting the tab puts it in the URL, and reload restores it", async ({ page }) => {
    await page.goto("/dashboard/review");
    await page.getByRole("tab", { name: "Source Health" }).click();
    await expect(page).toHaveURL(/tab=source-health/);

    await page.reload();
    await expect(page.getByRole("tab", { name: "Source Health" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("the default tab is unchanged and carries no query string", async ({ page }) => {
    await page.goto("/dashboard/review");
    await expect(page).not.toHaveURL(/tab=/);
    await expect(page.getByRole("tab", { name: /Legacy Queue/ })).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
