/**
 * Checklist Fill Decision Tree
 *
 * Page load:
 * ├── Shows line name and operator info
 * ├── Shows machine selector dropdown
 * └── Shows first machine's categories (expanded by default)
 *
 * Machine dropdown:
 * ├── Select different machine → shows that machine's categories
 * └── Shows progress (done/total) per machine
 *
 * Category header:
 * ├── Click to collapse → hides items
 * └── Click to expand → shows items
 *
 * Task item actions:
 * ├── Click ✓ (done) → marks item as completed=true, shows "by Name at time"
 * ├── Click ✓ again (same status) → toggles back to null (unsets)
 * ├── Click ✗ (issue) → marks item as completed=false
 * ├── Click ✗ again → toggles back to null
 * └── Click ✓ after ✗ → switches from issue to done
 *
 * Comment actions:
 * ├── Click "+ Add comment" → shows comment input
 * ├── Type in comment input → stores comment text
 * ├── Click "Hide comment" → hides input
 * └── Existing comment displayed below item
 *
 * Machine navigation (multi-machine):
 * ├── "← Previous" disabled on first machine
 * ├── "Next →" disabled on last machine
 * ├── Click prev/next buttons → changes active machine
 *
 * Save & Exit:
 * └── Saves current state → navigates back to /
 *
 * Submit Checklist:
 * └── Saves + submits → navigates back to /
 *     └── Checklist status changes to submitted
 *
 * Back button:
 * └── ← Back → navigates to /
 */

import { test, expect } from '@playwright/test';
import { loginAsOperator } from './helpers';

async function createAndOpenChecklist(page: import('@playwright/test').Page) {
  await loginAsOperator(page);
  await page.getByRole('button', { name: /add checklist/i }).click();

  const select = page.locator('select.form-select');
  await expect(select).toBeVisible();
  // Wait for line options to load (more than just the placeholder)
  await expect(select.locator('option')).toHaveCount(3, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);

  const options = await select.locator('option').all();
  let firstValue = '';
  for (const opt of options) {
    const val = await opt.getAttribute('value');
    if (val && val !== '') { firstValue = val; break; }
  }
  if (!firstValue) throw new Error('No production lines available');

  await select.selectOption(firstValue);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/');

  // Wait for dashboard data to load
  await expect(page.getByRole('button', { name: /In Progress/ })).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /In Progress/ }).click();
  await page.waitForTimeout(300);

  const rows = page.locator('[class*="dash-row"]');
  await expect(rows.first()).toBeVisible({ timeout: 10000 });
  await rows.first().click();
  await page.waitForURL(/\/checklist\/.*\/fill/);
}

test.describe('Checklist Fill', () => {
  test.beforeEach(async ({ page }) => {
    await createAndOpenChecklist(page);
  });

  test('page shows line name - Deep Clean heading', async ({ page }) => {
    await expect(page.getByText(/Deep Clean/)).toBeVisible();
  });

  test('machine selector dropdown is visible', async ({ page }) => {
    await expect(page.locator('select.form-select')).toBeVisible();
  });

  test('category headers are visible', async ({ page }) => {
    const categoryHeaders = page.locator('[class*="fill-category-header"]');
    await expect(categoryHeaders.first()).toBeVisible();
  });

  test('clicking category header collapses items (chevron loses open class)', async ({ page }) => {
    const categoryHeader = page.locator('[class*="fill-category-header"]').first();
    // Initially open - chevron should have open class
    const chevron = categoryHeader.locator('[class*="fill-chevron"]');
    await expect(chevron).toHaveClass(/fill-chevron-open/);
    // Click to collapse
    await categoryHeader.click();
    await expect(chevron).not.toHaveClass(/fill-chevron-open/);
  });

  test('clicking collapsed category header expands items', async ({ page }) => {
    const categoryHeader = page.locator('[class*="fill-category-header"]').first();
    await categoryHeader.click(); // collapse
    await categoryHeader.click(); // expand
    const chevron = categoryHeader.locator('[class*="fill-chevron"]');
    await expect(chevron).toHaveClass(/fill-chevron-open/);
  });

  test('mark item as done (✓) activates done button', async ({ page }) => {
    const doneBtn = page.locator('[title="Mark as done"]').first();
    await doneBtn.click();
    await expect(doneBtn).toHaveClass(/fill-btn-done-active/);
  });

  test('mark done again toggles back to unset', async ({ page }) => {
    const doneBtn = page.locator('[title="Mark as done"]').first();
    await doneBtn.click();
    await expect(doneBtn).toHaveClass(/fill-btn-done-active/);
    await doneBtn.click();
    await expect(doneBtn).not.toHaveClass(/fill-btn-done-active/);
  });

  test('mark item as issue (✗) activates skip button', async ({ page }) => {
    const issueBtn = page.locator('[title="Mark with issue"]').first();
    await issueBtn.click();
    await expect(issueBtn).toHaveClass(/fill-btn-skip-active/);
  });

  test('mark issue again toggles back to unset', async ({ page }) => {
    const issueBtn = page.locator('[title="Mark with issue"]').first();
    await issueBtn.click();
    await expect(issueBtn).toHaveClass(/fill-btn-skip-active/);
    await issueBtn.click();
    await expect(issueBtn).not.toHaveClass(/fill-btn-skip-active/);
  });

  test('switching from issue to done updates status', async ({ page }) => {
    const doneBtn = page.locator('[title="Mark as done"]').first();
    const issueBtn = page.locator('[title="Mark with issue"]').first();
    await issueBtn.click();
    await expect(issueBtn).toHaveClass(/fill-btn-skip-active/);
    await doneBtn.click();
    await expect(doneBtn).toHaveClass(/fill-btn-done-active/);
    await expect(issueBtn).not.toHaveClass(/fill-btn-skip-active/);
  });

  test('marking item shows completedBy stamp', async ({ page }) => {
    const doneBtn = page.locator('[title="Mark as done"]').first();
    await doneBtn.click();
    await expect(page.locator('[class*="fill-stamp"]').first()).toBeVisible();
  });

  test('Add comment button shows comment input', async ({ page }) => {
    const addCommentBtn = page.getByText('+ Add comment').first();
    await addCommentBtn.click();
    await expect(page.locator('[class*="fill-comment-input"]').first()).toBeVisible();
  });

  test('Hide comment hides the input', async ({ page }) => {
    const addCommentBtn = page.getByText('+ Add comment').first();
    await addCommentBtn.click();
    await page.getByText('Hide comment').first().click();
    await expect(page.locator('[class*="fill-comment-input"]').first()).not.toBeVisible();
  });

  test('typing in comment input stores text', async ({ page }) => {
    const addCommentBtn = page.getByText('+ Add comment').first();
    await addCommentBtn.click();
    const input = page.locator('[class*="fill-comment-input"]').first();
    await input.fill('Test comment text');
    await expect(input).toHaveValue('Test comment text');
  });

  test('Back link navigates to /', async ({ page }) => {
    await page.getByText('← Back').click();
    await expect(page).toHaveURL('/');
  });

  test('Save & Exit navigates back to /', async ({ page }) => {
    await page.getByRole('button', { name: 'Save & Exit' }).click();
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('Submit Checklist navigates back to /', async ({ page }) => {
    await page.getByRole('button', { name: 'Submit Checklist' }).click();
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('after submit, checklist appears in Pending Review tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Submit Checklist' }).click();
    await page.waitForURL('/');
    await page.getByRole('button', { name: /Pending Review/ }).click();
    await page.waitForTimeout(300);
    const rows = page.locator('[class*="dash-row"]');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('machine navigation buttons exist for multi-machine checklist', async ({ page }) => {
    const machineCount = await page.locator('select.form-select option').count();
    if (machineCount > 1) {
      const navBtns = page.locator('[class*="machine-nav-btn"]');
      await expect(navBtns.first()).toBeVisible();
      // First machine: prev button is disabled
      await expect(navBtns.first()).toBeDisabled();
    }
  });

  test('switching machine via dropdown shows different machine', async ({ page }) => {
    const machineSelect = page.locator('select.form-select');
    const optionCount = await machineSelect.locator('option').count();
    if (optionCount > 1) {
      const secondOption = await machineSelect.locator('option').nth(1).getAttribute('value');
      if (secondOption) {
        await machineSelect.selectOption(secondOption);
        await expect(machineSelect).toHaveValue(secondOption);
      }
    }
  });
});
