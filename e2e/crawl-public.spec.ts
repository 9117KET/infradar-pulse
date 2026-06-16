import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES } from "./utils/routes";
import { watchPage, formatFindings, attachReport, type Finding } from "./utils/page-health";

/**
 * Deterministic public-route crawler (Layer A).
 *
 * ONE test, ONE browser window: it navigates smoothly from route to route
 * (no close/reopen between pages) and aggregates findings. Fails on SEVERE
 * findings (uncaught exceptions, console errors incl. CORS). HTTP/network and
 * a11y issues are reported as warnings — set CRAWL_STRICT=1 to fail on those too.
 *
 *   npm run test:crawl          # headless gate
 *   npm run test:crawl:watch    # one visible window, slowed down, smooth tour
 */
const STRICT = !!process.env.CRAWL_STRICT;

test.describe("Crawl — public routes", () => {
  test("all public routes load clean", async ({ page }, testInfo) => {
    // One test covers every route, so give it room (slower under --headed slowMo).
    test.setTimeout(PUBLIC_ROUTES.length * 12_000);
    const health = watchPage(page);
    const reports: string[] = [];
    const blocking: { route: string; findings: Finding[] }[] = [];

    for (const route of PUBLIC_ROUTES) {
      health.reset();
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // The app holds a realtime websocket, so networkidle never fires — give
      // client-side fetches a fixed beat to run and render instead.
      await page.waitForTimeout(1_500);

      const findings = await health.collect();
      reports.push(formatFindings(route, findings));
      const bad = STRICT ? findings : findings.filter((f) => f.severe);
      if (bad.length) blocking.push({ route, findings: bad });
    }

    const full = reports.join("\n");
    await attachReport(testInfo, "crawl-public", full);
    console.log("\n" + full + "\n");

    const summary = blocking.map((b) => formatFindings(b.route, b.findings)).join("\n");
    expect(blocking, `Blocking findings:\n${summary}`).toHaveLength(0);
  });
});
