import { test, expect } from '@playwright/test';

/**
 * Feature 4: Dedicated tender_events table
 * Verifies Tenders page routing and that no JS errors occur (regex parsing removed).
 */

test.describe('Tender Events structured table', () => {
  test('Tenders page route works', async ({ page }) => {
    const response = await page.goto('/dashboard/tenders');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/login|dashboard/);
  });

  test('Tenders page has no critical JS errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/dashboard/tenders');
    await page.waitForLoadState('networkidle');
    const critical = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('favicon') &&
      !e.includes('401') &&
      !e.includes('403') &&
      !e.includes('supabase')
    );
    expect(critical).toHaveLength(0);
  });

  test('TenderCalendar page still works', async ({ page }) => {
    const response = await page.goto('/dashboard/calendar');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/login|dashboard/);
  });
});
