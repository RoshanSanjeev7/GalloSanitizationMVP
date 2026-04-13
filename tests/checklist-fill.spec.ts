import { test, expect } from '@playwright/test';
import { OPERATOR, login } from './helpers';

test.describe('Checklist Fill', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OPERATOR);
    // Navigate to an in-progress checklist by clicking the first row
    await page.click('button:has-text("In Progress")');
    await page.locator('text=Line').first().click();
    await page.waitForURL(/\/checklist\/.*\/fill/);
  });

  test('shows checklist title and operator info', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Deep Clean');
  });

  test('shows machine selector buttons', async ({ page }) => {
    // Machine buttons render with name + progress, look for the percentage pattern
    await expect(page.locator('text=/%/')).toBeVisible({ timeout: 5000 });
  });

  test('shows collapsible categories with counts', async ({ page }) => {
    await expect(page.locator('text=/\\d+\\/\\d+/').first()).toBeVisible();
  });

  test('can toggle item status', async ({ page }) => {
    // Click done button (checkmark) on first visible item
    const doneBtn = page.locator('[title="Mark as done"]').first();
    await doneBtn.click();
    // After toggle + auto-save debounce, save status should show "Saved"
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 });
  });

  test('can switch between machines', async ({ page }) => {
    // Machine buttons contain "name\ndone/total"
    const machineButtons = page.locator('button:has-text("/")');
    const machineCount = await machineButtons.count();
    if (machineCount > 1) {
      await machineButtons.nth(1).click();
      await page.waitForTimeout(300);
      await expect(page.locator('text=/\\d+\\/\\d+/').first()).toBeVisible();
    }
  });

  test('can add a comment', async ({ page }) => {
    const commentBtn = page.locator('text=+ Add comment').first();
    await commentBtn.click();
    const input = page.locator('input[placeholder="Leave a comment..."]').first();
    await expect(input).toBeVisible();
    await input.fill('Playwright test comment');
  });

  test('back button navigates to dashboard', async ({ page }) => {
    await page.click('text=Back');
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('submit button opens confirmation modal', async ({ page }) => {
    await page.locator('button:has-text("Submit Checklist")').first().click();
    // Modal shows either "Are you sure" (all complete) or "Cannot Submit" (items remaining)
    await expect(page.locator('h2:text-matches("Submit Checklist|Cannot Submit")')).toBeVisible();
    await page.locator('button:has-text("Cancel"), button:has-text("Close")').first().click();
  });
});
