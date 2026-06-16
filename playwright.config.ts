import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E defaults. Override PLAYWRIGHT_BASE_URL if the dev server is not on port 8080 (see vite.config.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    // Slow actions down so a headed/ui run is watchable. Defaults to 400ms when
    // running headed; override with SLOWMO=<ms> (0 disables).
    launchOptions: {
      slowMo:
        process.env.SLOWMO !== undefined
          ? Number(process.env.SLOWMO)
          : process.argv.some((a) => a === "--headed" || a === "--ui")
            ? 400
            : 0,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
