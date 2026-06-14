import { test, expect, login, logout } from "./fixtures/auth";

/**
 * Core auth flow: sign-in lands on the dashboard, protected routes require auth,
 * and logout returns the user to a signed-out state.
 */
test.describe("Auth flow", () => {
  test("valid sign-in reaches the dashboard", async ({ page }) => {
    await login(page, "user");
    await expect(page).toHaveURL(/\/dashboard(\/|$)/);
  });

  test("invalid credentials do not navigate to the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("security-test-user@infradar.local");
    await page.locator('input[type="password"]').fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Stay on /login; a destructive toast appears and no dashboard redirect happens.
    await expect(page).toHaveURL(/\/login/);
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/dashboard");
  });

  test("logout returns to a signed-out state (dashboard bounces to login)", async ({ page }) => {
    await login(page, "user");
    await logout(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
