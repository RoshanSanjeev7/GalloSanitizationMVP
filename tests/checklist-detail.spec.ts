import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login } from './helpers';

test.describe('Checklist Detail (read-only view)', () => {
  test('operator can view completed checklist', async ({ page }) => {
    await login(page, OPERATOR);
    await page.click('button:has-text("Completed")');
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await expect(page).toHaveURL(/\/checklist\/[^/]+$/);
      await expect(page.locator('h2')).toBeVisible();
    }
  });

  test('admin sees export PDF button', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button:has-text("All")');
    // Click a non-submitted checklist to get detail view
    await page.click('button:has-text("Approved")');
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await expect(page).toHaveURL(/\/checklist\/[^/]+$/);
      await expect(page.locator('button:has-text("Export PDF")')).toBeVisible();
    }
  });

  test('detail page shows summary sidebar', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button:has-text("Approved")');
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await expect(page.locator('text=Created By')).toBeVisible();
      await expect(page.locator('text=Duration')).toBeVisible();
      await expect(page.locator('text=Completion')).toBeVisible();
      await expect(page.locator('text=Machine Progress')).toBeVisible();
    }
  });

  test('back button navigates away', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button:has-text("Approved")');
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await page.click('text=Back');
      await expect(page).not.toHaveURL(/\/checklist\//);
    }
  });
});
