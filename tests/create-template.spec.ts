import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Create Template', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.click('text=Create Template');
    await page.waitForURL('/templates/create');
    await expect(page.locator('text=Select a Line')).toBeVisible({ timeout: 10000 });
  });

  test('shows template page with line selector', async ({ page }) => {
    // beforeEach already confirms "Select a Line" is visible
    await expect(page.locator('select')).toBeVisible();
    await expect(page.locator('text=+ Create New Line')).toBeVisible();
  });

  test('shows template form after selecting a line', async ({ page }) => {
    await page.locator('select').selectOption({ index: 1 });
    await expect(page.locator('text=Template Title')).toBeVisible();
    await expect(page.locator('text=Machines')).toBeVisible();
  });

  test('can fill in template form', async ({ page }) => {
    await page.locator('select').selectOption({ index: 1 });
    await page.fill('input[placeholder*="Weekly Deep Clean"]', 'Test Template');
    await page.fill('input[placeholder*="Filler"]', 'Test Machine');
    await page.fill('input[placeholder*="Prep"]', 'Test Category');
    await page.fill('input[placeholder*="task description"]', 'Test task');

    const saveBtn = page.locator('button:has-text("Save Changes"), button:has-text("Create Template")');
    await expect(saveBtn).toBeEnabled();
  });

  test('can add machines', async ({ page }) => {
    // First create a new line so we get a clean template
    await page.click('text=+ Create New Line');
    await page.fill('input[placeholder*="Line 94"]', `TestMachLine${Date.now()}`);
    await page.locator('button:has-text("Create")').first().click();
    // Now we're on a new template with one empty machine
    await expect(page.locator('text=+ Add Machine')).toBeVisible();
    await page.click('text=+ Add Machine');
    await expect(page.locator('button:has-text("Machine 2")')).toBeVisible();
  });

  test('cancel navigates back to admin', async ({ page }) => {
    await page.locator('select').selectOption({ index: 1 });
    await page.click('button:has-text("Cancel")');
    await expect(page).toHaveURL('/admin');
  });

  test('can create new line', async ({ page }) => {
    await page.click('text=+ Create New Line');
    await page.fill('input[placeholder*="Line 94"]', 'Test Line E2E');
    await page.click('button:has-text("Create")');
    // Line should auto-select and show template form
    await expect(page.locator('text=Creating new template for Test Line E2E')).toBeVisible();
  });
});
