import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Submission Review', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button:has-text("Pending")');
  });

  test('shows review page with approve/deny buttons', async ({ page }) => {
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForURL(/\/review/);
      await expect(page.locator('h2')).toContainText('Submission Review');
      await expect(page.locator('button:has-text("Approve")')).toBeVisible();
      await expect(page.locator('button:has-text("Deny")')).toBeVisible();
      await expect(page.locator('button:has-text("Edit Checklist")')).toBeVisible();
    }
  });

  test('edit mode shows editable items', async ({ page }) => {
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForURL(/\/review/);

      await page.click('button:has-text("Edit Checklist")');
      await expect(page.locator('h2')).toContainText('Edit Submission');
      await expect(page.locator('button:has-text("Save Changes")')).toBeVisible();
      await expect(page.locator('button:has-text("Cancel")').first()).toBeVisible();

      // Cancel returns to review mode
      await page.click('button:has-text("Cancel")');
      await expect(page.locator('h2')).toContainText('Submission Review');
    }
  });

  test('sidebar shows summary, completion, and machine progress', async ({ page }) => {
    const row = page.locator('[class*="dashRow"]').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForURL(/\/review/);
      await expect(page.locator('text=Summary')).toBeVisible();
      await expect(page.locator('text=Completion')).toBeVisible();
      await expect(page.locator('text=Machine Progress')).toBeVisible();
    }
  });
});
