import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Create Template', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.click('text=Create Template');
    await page.waitForURL('/templates/create');
  });

  test('shows template creation form', async ({ page }) => {
    await expect(page.locator('h2')).toHaveText('Create Checklist Template');
    await expect(page.locator('input[placeholder*="Deep Clean"]')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });

  test('create button disabled without title and line', async ({ page }) => {
    const createBtn = page.locator('button:has-text("Create Template")');
    await expect(createBtn).toBeDisabled();
  });

  test('can fill in template form', async ({ page }) => {
    await page.fill('input[placeholder*="Deep Clean"]', 'Playwright Test Template');
    await page.selectOption('select', { index: 1 });
    await page.fill('input[placeholder*="Filler"]', 'Test Machine');
    await page.fill('input[placeholder*="Prep"]', 'Test Category');
    await page.fill('input[placeholder*="task description"]', 'Test task item');

    const createBtn = page.locator('button:has-text("Create Template")');
    await expect(createBtn).toBeEnabled();
  });

  test('can add machines', async ({ page }) => {
    await page.click('text=+ Add Machine');
    // Should now have Machine 1 and Machine 2 tabs
    await expect(page.locator('button:has-text("Machine 1")')).toBeVisible();
    await expect(page.locator('button:has-text("Machine 2")')).toBeVisible();
  });

  test('cancel navigates back to admin', async ({ page }) => {
    await page.click('button:has-text("Cancel")');
    await expect(page).toHaveURL('/admin');
  });
});
