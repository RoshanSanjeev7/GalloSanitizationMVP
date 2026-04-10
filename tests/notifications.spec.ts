import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Admin Notification Bell', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.waitForTimeout(500);
  });

  test('bell icon is visible in header', async ({ page }) => {
    const bell = page.getByLabel('Notifications');
    await expect(bell).toBeVisible();
  });

  test('clicking bell opens notification dropdown with Activity header', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(300);
    // Activity header with count — use regex to match "Activity (N)"
    await expect(page.locator('span').filter({ hasText: /^Activity \(\d+\)$/ })).toBeVisible();
  });

  test('dropdown shows notification rows with operator names', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(500);

    // Check if there are any notifications
    const activityHeader = page.locator('span').filter({ hasText: /^Activity \(\d+\)$/ });
    const headerText = await activityHeader.textContent();
    const count = parseInt(headerText?.match(/\d+/)?.[0] || '0');

    if (count > 0) {
      // Should show at least one operator name
      const hasOperator = await page.locator('text=Gabriel Sanchez').or(page.locator('text=Marcus Rivera')).first().isVisible();
      expect(hasOperator).toBe(true);
    }
  });

  test('dropdown shows status tags (Pending Review or In Progress)', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(500);

    const activityHeader = page.locator('span').filter({ hasText: /^Activity \(\d+\)$/ });
    const headerText = await activityHeader.textContent();
    const count = parseInt(headerText?.match(/\d+/)?.[0] || '0');

    if (count > 0) {
      // Should have either "Pending Review" or "In Progress" tags
      const hasTags = await page.locator('text=Pending Review').or(page.locator('text=In Progress')).first().isVisible();
      expect(hasTags).toBe(true);
    }
  });

  test('dropdown shows timestamps (Submitted or Started)', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(500);

    const activityHeader = page.locator('span').filter({ hasText: /^Activity \(\d+\)$/ });
    const headerText = await activityHeader.textContent();
    const count = parseInt(headerText?.match(/\d+/)?.[0] || '0');

    if (count > 0) {
      const hasTimestamp = await page.locator('text=/Submitted|Started/').first().isVisible();
      expect(hasTimestamp).toBe(true);
    }
  });

  test('clicking outside closes the dropdown', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(300);
    const header = page.locator('span').filter({ hasText: /^Activity \(\d+\)$/ });
    await expect(header).toBeVisible();

    // Click the page title to close
    await page.click('h1');
    await page.waitForTimeout(300);
    await expect(header).toBeHidden();
  });

  test('mark all as read updates submitted items to Viewed', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(500);

    const markAllBtn = page.locator('button:has-text("Mark all as read")');
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click();
      await page.waitForTimeout(500);

      // Submitted items should now show "Viewed" (wait for UI to update)
      await expect(async () => {
        const viewedCount = await page.locator('text=Viewed').count();
        expect(viewedCount).toBeGreaterThan(0);
      }).toPass({ timeout: 5000 });
    }
  });

  test('clicking a notification navigates away from admin', async ({ page }) => {
    await page.click('[aria-label="Notifications"]');
    await page.waitForTimeout(500);

    const activityHeader = page.locator('span').filter({ hasText: /^Activity \(\d+\)$/ });
    const headerText = await activityHeader.textContent();
    const count = parseInt(headerText?.match(/\d+/)?.[0] || '0');

    if (count > 0) {
      // Click the first notification's line name
      const firstLineName = page.locator('span').filter({ hasText: /^Line \d+$/ }).first();
      if (await firstLineName.isVisible()) {
        await firstLineName.click();
        await page.waitForURL(/\/checklist\//, { timeout: 5000 });
        expect(page.url()).toContain('/checklist/');
      }
    }
  });

  test('viewing a checklist via main list marks it as viewed in notifications', async ({ page }) => {
    // Click on a pending checklist from the main dashboard list
    await page.click('button:has-text("Pending")');
    await page.waitForTimeout(500);

    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForURL(/\/checklist\//, { timeout: 5000 });
      await page.waitForTimeout(300);

      // Navigate back
      await page.goto('/admin');
      await page.waitForTimeout(500);

      // Open notifications — should see at least one "Viewed"
      await page.click('[aria-label="Notifications"]');
      await page.waitForTimeout(500);
      const viewedCount = await page.locator('text=Viewed').count();
      expect(viewedCount).toBeGreaterThan(0);
    }
  });
});
