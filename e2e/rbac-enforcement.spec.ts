import { test, expect } from "./fixtures/auth";

/**
 * RBAC route enforcement (RoleGuard). Requires seeded users on the backend the
 * app points at (see fixtures/auth.ts). admin ⊇ researcher ⊇ user.
 *
 *   admin-only:      /dashboard/users, /dashboard/subscribers, /dashboard/datasets,
 *                    /dashboard/traction, /dashboard/bd-pipeline, /dashboard/feedback
 *   researcher-only: /dashboard/research, /dashboard/review, /dashboard/agents, ...
 *
 * RoleGuard redirects an authenticated-but-unauthorized user to /dashboard.
 */
const ADMIN_ROUTES = ["/dashboard/users", "/dashboard/subscribers", "/dashboard/feedback"];
const RESEARCHER_ROUTES = ["/dashboard/research", "/dashboard/review", "/dashboard/agents"];

test.describe("RBAC — plain user is blocked from elevated routes", () => {
  test("user is redirected away from admin-only routes", async ({ asUser: page }) => {
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      // RoleGuard bounces unauthorized users to /dashboard (not the requested route).
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
      expect(page.url()).not.toContain(route.split("/").pop()!);
    }
  });

  test("user is redirected away from researcher-only routes", async ({ asUser: page }) => {
    for (const route of RESEARCHER_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    }
  });
});

test.describe("RBAC — admin reaches elevated routes", () => {
  test("admin can open admin-only and researcher-only routes", async ({ asStaff: page }) => {
    for (const route of [...ADMIN_ROUTES, ...RESEARCHER_ROUTES]) {
      await page.goto(route);
      // Admin stays on the requested route (no bounce to /dashboard root).
      await expect(page).toHaveURL(new RegExp(route.replace(/\//g, "\\/")), { timeout: 10_000 });
    }
  });
});

test.describe("RBAC — unauthenticated access", () => {
  test("unauthenticated user hitting a dashboard route lands on /login", async ({ page }) => {
    await page.goto("/dashboard/users");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
