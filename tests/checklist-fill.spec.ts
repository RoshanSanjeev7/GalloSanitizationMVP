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

  test('shows machine selector with options', async ({ page }) => {
    const select = page.locator('select.form-select');
    await expect(select).toBeVisible();
    const options = select.locator('option');
    expect(await options.count()).toBeGreaterThan(0);
  });

  test('shows collapsible categories with counts', async ({ page }) => {
    await expect(page.locator('text=/\\d+\\/\\d+/').first()).toBeVisible();
  });

  test('can toggle item status', async ({ page }) => {
    // Get initial count of category (e.g., "0/3")
    const category = page.locator('button:has-text("/")').first();
    const initialText = await category.textContent();
    const initialDone = parseInt(initialText?.match(/(\d+)\//)?.[1] || '0');

    // Click done button (checkmark) on first visible item
    const doneBtn = page.locator('[title="Mark as done"]').first();
    await doneBtn.click();

    // Category count should increment (wait for re-render)
    await expect(async () => {
      const text = await category.textContent();
      const newDone = parseInt(text?.match(/(\d+)\//)?.[1] || '0');
      expect(newDone).toBe(initialDone + 1);
    }).toPass({ timeout: 10000 });
  });

  test('can switch between machines', async ({ page }) => {
    const select = page.locator('select.form-select');
    const machineCount = await select.locator('option').count();
    if (machineCount > 1) {
      await select.selectOption({ index: 1 });
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
    await expect(page.locator('text=Are you sure you want to submit')).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });
});
