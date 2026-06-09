import { test, expect } from '@playwright/test';

/**
 * Feature 3: Satellite → Multi-Source Verified reframe
 * Verifies marketing copy and evidence UI don't reference unsupported satellite imagery claims.
 */

test.describe('Multi-Source Verification reframe', () => {
  test('Landing page capabilities section no longer claims satellite imagery analysis', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    // Should not contain "satellite imagery analysis" (the old claim)
    expect(body).not.toContain('satellite imagery analysis');
    // Should contain the new accurate framing
    expect(body?.toLowerCase()).toContain('multi-source');
  });

  test('Landing page contains contractor intelligence module', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).toContain('contractor');
  });

  test('Landing page delay prediction description is factual', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    // Old unsubstantiated claim: "6-9 months ahead"
    // New: references the health score which is real
    expect(body?.toLowerCase()).toContain('health score');
  });
});
