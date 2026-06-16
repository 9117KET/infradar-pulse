import { test, expect, login } from "./fixtures/auth";
import { USER_ROUTES, STAFF_ROUTES } from "./utils/routes";
import { watchPage, formatFindings, attachReport, type Finding } from "./utils/page-health";

/**
 * Deterministic authenticated-route crawler (Layer A).
 *
 * Logs in once per role, then takes a smooth single-window tour of that role's
 * routes (no close/reopen between pages). Fails on SEVERE findings (uncaught
 * exceptions, console errors). HTTP/network and a11y issues are reported as
 * warnings unless CRAWL_STRICT=1.
 *
 * Requires the seeded test users and the dev server pointed at the same backend:
 *   npm run sb:seed-security-test-users
 *   npm run test:crawl
 */
const STRICT = !!process.env.CRAWL_STRICT;

async function tour(
  page: import("@playwright/test").Page,
  routes: string[],
  testInfo: import("@playwright/test").TestInfo,
  label: string,
) {
  test.setTimeout(routes.length * 12_000 + 30_000);
  const health = watchPage(page);
  const reports: string[] = [];
  const blocking: { route: string; findings: Finding[] }[] = [];

  for (const route of routes) {
    health.reset();
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Realtime websocket means networkidle never settles — use a fixed beat.
    await page.waitForTimeout(1_500);

    const findings = await health.collect();
    reports.push(formatFindings(route, findings));
    const bad = STRICT ? findings : findings.filter((f) => f.severe);
    if (bad.length) blocking.push({ route, findings: bad });
  }

  const full = reports.join("\n");
  await attachReport(testInfo, `crawl-${label}`, full);
  console.log(`\n[${label}]\n${full}\n`);

  const summary = blocking.map((b) => formatFindings(b.route, b.findings)).join("\n");
  expect(blocking, `Blocking findings:\n${summary}`).toHaveLength(0);
}

test.describe("Crawl — authenticated routes", () => {
  test("user routes load clean", async ({ page }, testInfo) => {
    await login(page, "user");
    await tour(page, USER_ROUTES, testInfo, "user");
  });

  test("staff routes load clean", async ({ page }, testInfo) => {
    await login(page, "staff");
    await tour(page, STAFF_ROUTES, testInfo, "staff");
  });
});
