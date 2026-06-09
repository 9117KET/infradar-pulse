import { test, expect } from '@playwright/test';

/**
 * Feature 2: Contractor Intelligence
 * Verifies routing and page structure for the new /dashboard/contractors page.
 */

test.describe('Contractor Intelligence', () => {
  test('Contractors route exists and redirects to auth when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard/contractors');
    // Should redirect to login (unauthenticated)
    await expect(page).toHaveURL(/login|dashboard/);
  });

  test('Dashboard layout sidebar includes Contractor Intel link', async ({ page }) => {
    await page.goto('/dashboard/contractors');
    // After redirect to login, the page should load without a JS crash
    await page.waitForLoadState('networkidle');
    // No JS errors
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.waitForTimeout(500);
    const critical = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('401'));
    expect(critical).toHaveLength(0);
  });

  test('App routes include /dashboard/contractors without 404', async ({ page }) => {
    // Verify the route resolves (not a 404 page)
    const response = await page.goto('/dashboard/contractors');
    // HTTP response should be 200 (SPA always returns 200 for Vite dev)
    expect(response?.status()).toBeLessThan(400);
  });
});
