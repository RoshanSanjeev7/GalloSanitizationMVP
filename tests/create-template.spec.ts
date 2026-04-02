/**
 * Create Template Decision Tree
 *
 * Page load:
 * ├── Shows "Create Checklist Template" heading
 * ├── Shows Template Title input
 * ├── Shows "Assign to Line" dropdown
 * ├── Shows Machines section with 1 default machine tab
 * └── Machine card shows: machine name input, category, task inputs
 *
 * Template Details:
 * ├── Fill title → stores value
 * └── Select line → enables Create Template button (with title)
 *
 * Create Template button:
 * ├── Disabled when title is empty
 * ├── Disabled when no line selected
 * └── Enabled when both title and line are set
 *
 * Machine management:
 * ├── Click "+ Add Machine" → adds new machine tab
 * ├── Switch machine tab → shows that machine's form
 * ├── Enter machine name → updates tab label
 * └── Click × on machine tab (when >1 machines) → removes machine
 *
 * Category management:
 * ├── Click "+ Add Category" → adds new category section
 * ├── Enter category name → updates input
 * └── Click × on category (when >1 categories) → removes category
 *
 * Task management:
 * ├── Enter task description → updates input
 * ├── Click "+ Add Task" → adds new task input row
 * └── Click × on task (when >1 tasks) → removes task row
 *
 * Submit:
 * └── Click "Create Template" → calls API, navigates to /admin
 *
 * Cancel:
 * └── Click "Cancel" → navigates to /admin
 *
 * Back button:
 * └── ← Back → navigates to /admin
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Create Template', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/templates/create');
    // Wait for page to load
    await expect(page.getByText('Create Checklist Template')).toBeVisible();
  });

  test('shows Create Checklist Template heading', async ({ page }) => {
    await expect(page.getByText('Create Checklist Template')).toBeVisible();
  });

  test('shows Template Title input', async ({ page }) => {
    await expect(page.locator('input[placeholder="Deep Clean Checklist"]')).toBeVisible();
  });

  test('shows Assign to Line dropdown', async ({ page }) => {
    await expect(page.locator('select.form-select')).toBeVisible();
    await expect(page.getByText('Assign to Line')).toBeVisible();
  });

  test('Create Template button is disabled with no title', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Create Template' });
    await expect(createBtn).toBeDisabled();
  });

  test('Create Template button is disabled with title but no line', async ({ page }) => {
    await page.locator('input[placeholder="Deep Clean Checklist"]').fill('Test Template');
    const createBtn = page.getByRole('button', { name: 'Create Template' });
    await expect(createBtn).toBeDisabled();
  });

  test('Create Template button enabled with both title and line', async ({ page }) => {
    await page.locator('input[placeholder="Deep Clean Checklist"]').fill('Test Template');
    const lineSelect = page.locator('select.form-select');
    const options = await lineSelect.locator('option').all();
    let firstVal = '';
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { firstVal = val; break; }
    }
    if (firstVal) {
      await lineSelect.selectOption(firstVal);
      const createBtn = page.getByRole('button', { name: 'Create Template' });
      await expect(createBtn).toBeEnabled();
    }
  });

  test('machine tabs section is visible', async ({ page }) => {
    // The machine tabs container has class "machine-tabs"
    await expect(page.locator('[class*="machine-tabs"]')).toBeVisible();
  });

  test('first machine tab is visible', async ({ page }) => {
    const tabs = page.locator('button[class*="machine-tab"]');
    await expect(tabs.first()).toBeVisible();
  });

  test('entering machine name updates tab label', async ({ page }) => {
    const machineInput = page.locator('input[placeholder="e.g. Filler"]');
    await machineInput.fill('FILLER');
    await page.waitForTimeout(200);
    const tab = page.locator('button[class*="machine-tab"]').first();
    await expect(tab).toContainText('FILLER');
  });

  test('Add Machine button adds a new machine tab', async ({ page }) => {
    const beforeCount = await page.locator('button[class*="machine-tab"]').count();
    await page.getByText('+ Add Machine').click();
    await page.waitForTimeout(200);
    const afterCount = await page.locator('button[class*="machine-tab"]').count();
    expect(afterCount).toBe(beforeCount + 1);
  });

  test('remove machine button removes tab (when >1 machines)', async ({ page }) => {
    // Add a machine first so we have >1
    await page.getByText('+ Add Machine').click();
    await page.waitForTimeout(200);
    const beforeCount = await page.locator('button[class*="machine-tab"]').count();
    expect(beforeCount).toBeGreaterThan(1);

    // The remove button (×) is inside the machine card
    const removeBtn = page.locator('[class*="remove-btn"]').first();
    await removeBtn.click();
    await page.waitForTimeout(200);
    const afterCount = await page.locator('button[class*="machine-tab"]').count();
    expect(afterCount).toBe(beforeCount - 1);
  });

  test('category name input is visible', async ({ page }) => {
    await expect(page.locator('input[placeholder="e.g. Prep"]').first()).toBeVisible();
  });

  test('Add Category button adds a new category section', async ({ page }) => {
    const beforeCount = await page.locator('input[placeholder="e.g. Prep"]').count();
    await page.getByText('+ Add Category').click();
    await page.waitForTimeout(200);
    const afterCount = await page.locator('input[placeholder="e.g. Prep"]').count();
    expect(afterCount).toBe(beforeCount + 1);
  });

  test('entering category name updates input value', async ({ page }) => {
    const catInput = page.locator('input[placeholder="e.g. Prep"]').first();
    await catInput.fill('Setup');
    await expect(catInput).toHaveValue('Setup');
  });

  test('task description input is visible', async ({ page }) => {
    await expect(page.locator('input[placeholder="Enter task description..."]').first()).toBeVisible();
  });

  test('Add Task button adds a new task row', async ({ page }) => {
    const beforeCount = await page.locator('input[placeholder="Enter task description..."]').count();
    await page.getByText('+ Add Task').first().click();
    await page.waitForTimeout(200);
    const afterCount = await page.locator('input[placeholder="Enter task description..."]').count();
    expect(afterCount).toBe(beforeCount + 1);
  });

  test('remove task button removes task row (when >1 tasks)', async ({ page }) => {
    // Add a task first so we have 2
    await page.getByText('+ Add Task').first().click();
    await page.waitForTimeout(200);
    const beforeCount = await page.locator('input[placeholder="Enter task description..."]').count();
    // Find remove button inside task rows
    const taskRemoveBtns = page.locator('[class*="task-input-row"] [class*="remove-btn"]');
    if (await taskRemoveBtns.count() > 0) {
      await taskRemoveBtns.first().click();
      await page.waitForTimeout(200);
      const afterCount = await page.locator('input[placeholder="Enter task description..."]').count();
      expect(afterCount).toBe(beforeCount - 1);
    }
  });

  test('entering task description updates input', async ({ page }) => {
    const taskInput = page.locator('input[placeholder="Enter task description..."]').first();
    await taskInput.fill('Clean the machine thoroughly');
    await expect(taskInput).toHaveValue('Clean the machine thoroughly');
  });

  test('Cancel button navigates to /admin', async ({ page }) => {
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Back link navigates to /admin', async ({ page }) => {
    await page.getByText('← Back').click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('full template creation navigates to /admin on success', async ({ page }) => {
    await page.locator('input[placeholder="Deep Clean Checklist"]').fill(`E2E Template ${Date.now()}`);

    const lineSelect = page.locator('select.form-select');
    const options = await lineSelect.locator('option').all();
    let firstVal = '';
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { firstVal = val; break; }
    }
    if (!firstVal) return;

    await lineSelect.selectOption(firstVal);
    await page.locator('input[placeholder="e.g. Filler"]').fill('Test Machine');
    await page.locator('input[placeholder="e.g. Prep"]').first().fill('Test Category');
    await page.locator('input[placeholder="Enter task description..."]').first().fill('Test task description');

    await page.getByRole('button', { name: 'Create Template' }).click();
    await page.waitForURL('**/admin');
    await expect(page).toHaveURL(/\/admin/);
  });
});
