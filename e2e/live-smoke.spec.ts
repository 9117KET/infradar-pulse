import { test, expect } from "@playwright/test";

/**
 * Live go/no-go smoke — run against the DEPLOYED url before sharing it.
 *
 *   PLAYWRIGHT_BASE_URL=https://app.infradarpulse.com \
 *   LIVE_SMOKE_EMAIL=... LIVE_SMOKE_PASSWORD=... \
 *   npx playwright test e2e/live-smoke.spec.ts
 *
 * Keep it minimal (one real AI call) to limit credit burn. The AI assertion
 * watches the network for the portfolio-chat function returning 200, which
 * proves the end-to-end AI pipeline works in production without brittle UI parsing.
 *
 * Public-page checks always run. The authenticated AI check is skipped unless
 * LIVE_SMOKE_EMAIL / LIVE_SMOKE_PASSWORD are set, so the default local suite
 * never fails on missing live credentials.
 */
const LIVE_EMAIL = process.env.LIVE_SMOKE_EMAIL;
const LIVE_PASSWORD = process.env.LIVE_SMOKE_PASSWORD;

const criticalConsoleErrors = (page: import("@playwright/test").Page, sink: string[]) => {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (t.includes("ResizeObserver") || t.includes("favicon")) return;
    sink.push(t);
  });
};

test.describe("Live smoke — public surfaces", () => {
  test("home and pricing load without critical console errors", async ({ page }) => {
    const errors: string[] = [];
    criticalConsoleErrors(page, errors);
    await page.goto("/");
    await expect(page).toHaveTitle(/InfraRadar|Infradar/i);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    expect(await page.locator('script[src*="stripe"]').count()).toBe(0);
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

test.describe("Live smoke — authenticated AI", () => {
  test.skip(!LIVE_EMAIL || !LIVE_PASSWORD, "set LIVE_SMOKE_EMAIL / LIVE_SMOKE_PASSWORD to run");

  test("login works and a real AI call returns 200", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(LIVE_EMAIL!);
    await page.locator('input[type="password"]').fill(LIVE_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 20_000 });

    // Drive one AI call and assert the edge function answers 200.
    await page.goto("/dashboard/portfolio-chat").catch(() => page.goto("/dashboard/ask"));
    const input = page.getByRole("textbox").first();
    await input.waitFor({ state: "visible", timeout: 15_000 });
    await input.fill("Give me one infrastructure project to watch this quarter.");

    const aiResponse = page.waitForResponse(
      (r) => r.url().includes("/functions/v1/") && /portfolio-chat|user-research|nl-search/.test(r.url()),
      { timeout: 60_000 },
    );
    await page.keyboard.press("Enter");
    const res = await aiResponse;
    expect(res.status(), `AI function ${res.url()} returned ${res.status()}`).toBe(200);
  });
});
