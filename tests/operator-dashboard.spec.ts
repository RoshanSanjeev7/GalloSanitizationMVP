import { test, expect } from '@playwright/test';
import { OPERATOR, login } from './helpers';

test.describe('Operator Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OPERATOR);
  });

  test('shows welcome message with operator name', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('displays tab buttons with counts', async ({ page }) => {
    await expect(page.locator('button:has-text("In Progress")')).toBeVisible();
    await expect(page.locator('button:has-text("Pending")')).toBeVisible();
    await expect(page.locator('button:has-text("Completed")')).toBeVisible();
    await expect(page.locator('button:has-text("All")')).toBeVisible();
  });

  test('shows checklist rows with line names', async ({ page }) => {
    await expect(page.locator('text=Line').first()).toBeVisible();
  });

  test('switching tabs filters checklists', async ({ page }) => {
    await page.click('button:has-text("All")');
    const allText = await page.locator('button:has-text("All")').textContent();
    const allCount = parseInt(allText?.match(/\d+/)?.[0] || '0');

    await page.click('button:has-text("In Progress")');
    const ipText = await page.locator('button:has-text("In Progress")').textContent();
    const ipCount = parseInt(ipText?.match(/\d+/)?.[0] || '0');

    expect(allCount).toBeGreaterThanOrEqual(ipCount);
  });

  test('clicking in-progress checklist navigates to fill page', async ({ page }) => {
    await page.click('button:has-text("In Progress")');
    await page.locator('text=Line').first().click();
    await expect(page).toHaveURL(/\/checklist\/.*\/fill/);
  });

  test('create checklist via modal', async ({ page }) => {
    // Get initial All count
    const allTabBefore = await page.locator('button:has-text("All")').textContent();
    const countBefore = parseInt(allTabBefore?.match(/\d+/)?.[0] || '0');

    await page.click('button:has-text("Add Checklist")');
    await expect(page.locator('h2:has-text("New Checklist")')).toBeVisible();

    await page.locator('select.form-select').last().selectOption({ label: 'Line 91' });
    await page.locator('button:has-text("Create")').click();

    // Modal closes, checklist count increases
    await expect(page.locator('h2:has-text("New Checklist")')).not.toBeVisible();
    await page.waitForTimeout(500);
    const allTabAfter = await page.locator('button:has-text("All")').textContent();
    const countAfter = parseInt(allTabAfter?.match(/\d+/)?.[0] || '0');
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('settings link navigates to settings', async ({ page }) => {
    await page.click('text=Settings');
    await expect(page).toHaveURL('/settings');
  });
});
