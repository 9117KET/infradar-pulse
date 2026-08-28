/**
 * Pipeline, Compare and Countries moved from separate routes into tabs on
 * /dashboard/projects. All three read the same useProjects() data — they were
 * views of one table, not separate products.
 *
 * Covers what that merge can break:
 *   - old links and bookmarks must still resolve
 *   - each tab must render its own content, not an empty panel
 *   - the page must keep exactly one <h1> (each page carried its own)
 *   - the Countries *detail* route must survive: only the index moved
 */
import { test, expect } from "@playwright/test";
import { login } from "./fixtures/auth";

const MOVED = [
  { from: "/dashboard/pipeline", tab: "pipeline", label: "Pipeline" },
  { from: "/dashboard/compare", tab: "compare", label: "Compare" },
  { from: "/dashboard/countries", tab: "countries", label: "Countries" },
];

test.describe("Projects tabs", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "staff");
  });

  for (const { from, tab, label } of MOVED) {
    test(`${from} redirects onto the ${tab} tab`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`/dashboard/projects\\?tab=${tab}`));
      await expect(page.getByRole("tab", { name: label, exact: true })).toHaveAttribute(
        "data-state",
        "active",
      );
    });
  }

  test("each moved tab renders its own content", async ({ page }) => {
    await page.goto("/dashboard/projects?tab=pipeline");
    await expect(page.getByText("Projects grouped by stage", { exact: false })).toBeVisible();

    await page.goto("/dashboard/projects?tab=compare");
    await expect(page.getByText("Compare Projects", { exact: false }).first()).toBeVisible();

    await page.goto("/dashboard/projects?tab=countries");
    await expect(page.getByText("Country Intelligence", { exact: false }).first()).toBeVisible();
  });

  test("keeps a single page heading across every tab", async ({ page }) => {
    for (const tab of ["projects", "pipeline", "compare", "countries", "risk", "analytics"]) {
      await page.goto(`/dashboard/projects?tab=${tab}`);
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });

  test("clicking a tab writes it to the URL and survives reload", async ({ page }) => {
    // Regression: Tabs used defaultValue, so the URL could deep-link IN but a
    // click never wrote back — the view was unshareable and reset on reload.
    await page.goto("/dashboard/projects");
    await page.getByRole("tab", { name: "Compare", exact: true }).click();
    await expect(page).toHaveURL(/tab=compare/);

    await page.reload();
    await expect(page.getByRole("tab", { name: "Compare", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("the default tab carries no query string", async ({ page }) => {
    await page.goto("/dashboard/projects");
    await expect(page).not.toHaveURL(/tab=/);
    await expect(page.getByRole("tab", { name: "Projects", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("the country detail route still works", async ({ page }) => {
    // Only the countries INDEX became a tab. /dashboard/countries/:country is a
    // real detail page and must not have been swept into the redirect.
    await page.goto("/dashboard/countries/Kenya");
    await expect(page).toHaveURL(/\/dashboard\/countries\/Kenya/);
    await expect(page).not.toHaveURL(/tab=countries/);
  });
});
