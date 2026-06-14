import { test as base, expect, type Page } from "@playwright/test";

/**
 * Auth helpers + role-scoped fixtures for E2E.
 *
 * Credentials come from env (seed defaults via `npm run sb:seed-security-test-users`).
 * Point the app at the same backend the users live in — for the local stack, start
 * the dev server with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY set to local.
 */
export type Role = "user" | "staff" | "pro";

type Creds = { email: string; password: string };

export function credsFor(role: Role): Creds {
  switch (role) {
    case "staff":
      return {
        email: process.env.SECURITY_TEST_STAFF_EMAIL || "security-test-staff@infradar.local",
        password: process.env.SECURITY_TEST_STAFF_PASSWORD || "SecurityTest_Staff_01!",
      };
    case "pro":
      return {
        email: process.env.SECURITY_TEST_PRO_EMAIL || "security-test-pro@infradar.local",
        password: process.env.SECURITY_TEST_PRO_PASSWORD || "SecurityTest_Pro_01!",
      };
    default:
      return {
        email: process.env.SECURITY_TEST_USER_EMAIL || "security-test-user@infradar.local",
        password: process.env.SECURITY_TEST_USER_PASSWORD || "SecurityTest_User_01!",
      };
  }
}

/** Log in via the real /login form and wait until the dashboard is reachable. */
export async function login(page: Page, role: Role = "user"): Promise<void> {
  const { email, password } = credsFor(role);
  await page.goto("/login");
  // The login form's <label>s aren't associated with their inputs, so select by
  // input type (unambiguous on the login page) rather than by label.
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // On success the app navigates to /dashboard. Allow for the auth state to settle.
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 15_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/login");
}

/** Fixtures that arrive already authenticated as the named role. */
export const test = base.extend<{ asUser: Page; asStaff: Page; asPro: Page }>({
  // `provide` is Playwright's fixture-supply callback (normally named `use`);
  // renamed so eslint's react-hooks rule doesn't mistake it for a React Hook.
  asUser: async ({ page }, provide) => {
    await login(page, "user");
    await provide(page);
  },
  asStaff: async ({ page }, provide) => {
    await login(page, "staff");
    await provide(page);
  },
  asPro: async ({ page }, provide) => {
    await login(page, "pro");
    await provide(page);
  },
});

export { expect };
