import { test, expect } from '@playwright/test';
import { OPERATOR, login } from './helpers';

test.describe('Scalability: Network Resilience', () => {
  test('offline banner appears when going offline', async ({ page, context }) => {
    await login(page, OPERATOR);

    // Simulate going offline
    await context.setOffline(true);

    // The OfflineBanner should appear
    await expect(page.locator('text=You are offline')).toBeVisible({ timeout: 3000 });
  });

  test('offline banner disappears when back online', async ({ page, context }) => {
    await login(page, OPERATOR);

    // Go offline
    await context.setOffline(true);
    await expect(page.locator('text=You are offline')).toBeVisible({ timeout: 3000 });

    // Go back online
    await context.setOffline(false);
    await expect(page.locator('text=You are offline')).toBeHidden({ timeout: 3000 });
  });

  test('offline banner is styled prominently', async ({ page, context }) => {
    await login(page, OPERATOR);
    await context.setOffline(true);

    const banner = page.locator('text=You are offline');
    await expect(banner).toBeVisible({ timeout: 3000 });

    // Verify it's at the top of the page (fixed position)
    const box = await banner.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(50); // Near the top
  });
});
