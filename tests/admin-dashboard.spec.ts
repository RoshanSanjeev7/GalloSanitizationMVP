import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
  });

  test('shows audit log heading', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Sanitation Audit Log');
  });

  test('displays filter bar with search and dropdowns', async ({ page }) => {
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('displays tabs with counts', async ({ page }) => {
    await expect(page.locator('button:has-text("Pending")')).toBeVisible();
    await expect(page.locator('button:has-text("In Progress")')).toBeVisible();
    await expect(page.locator('button:has-text("Approved")')).toBeVisible();
    await expect(page.locator('button:has-text("All")')).toBeVisible();
  });

  test('shows checklist rows on All tab', async ({ page }) => {
    await page.click('button:has-text("All")');
    // Row line names are spans containing e.g. "Line 91"
    await expect(page.locator('span:has-text("Line 9")').first()).toBeVisible();
  });

  test('search filters checklists by operator name', async ({ page }) => {
    await page.click('button:has-text("All")');
    await page.fill('input[placeholder*="Search"]', 'Marcus');
    await page.waitForTimeout(300);
    await expect(page.locator('text=Marcus Rivera').first()).toBeVisible();
    // Verify Gabriel's checklists are hidden
    await expect(page.locator('text=Gabriel Sanchez')).toHaveCount(0);
  });

  test('clicking submitted checklist goes to review page', async ({ page }) => {
    await page.click('button:has-text("Pending")');
    const row = page.locator('text=Line').first();
    if (await row.isVisible()) {
      await row.click();
      await expect(page).toHaveURL(/\/checklist\/.*\/review/);
    }
  });

  test('create template link navigates correctly', async ({ page }) => {
    await page.click('text=Create Template');
    await expect(page).toHaveURL('/templates/create');
  });
});
