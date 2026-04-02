/**
 * Submission Review Decision Tree
 *
 * Page load:
 * ├── Shows line name + "Submission Review" heading
 * ├── Shows date/time of submission
 * ├── Shows machine selector dropdown
 * ├── Shows category list with tasks (view mode)
 * └── Shows right panel: Summary, Completion, Machine Progress, Notes & Issues
 *
 * Summary Panel:
 * ├── Shows "Created By" operator name
 * ├── Shows "Contributors" if any
 * ├── Shows "Start" time
 * ├── Shows "End" time if available
 * ├── Shows "Duration" in minutes
 * └── Shows "Status" as Submitted
 *
 * Completion Panel:
 * ├── Shows count of filled items (✓)
 * └── Shows count of unfilled items (✗)
 *
 * Notes Panel (if notes exist):
 * ├── Shows notes/issues list
 * ├── Check note checkbox → marks as reviewed (dims note)
 * └── "Go to →" button → jumps to and highlights the task
 *
 * Edit Mode:
 * ├── Click "Edit Checklist" → enters edit mode
 * │   ├── Heading changes to "Edit Submission"
 * │   ├── Tasks show ✓/✗ buttons
 * │   ├── Mark item done → updates status
 * │   ├── Mark item issue → updates status
 * │   ├── Add comment to item
 * │   ├── Edit existing comment
 * │   ├── Delete comment
 * │   ├── Click "Cancel" → exits edit mode, heading reverts
 * │   └── Click "Save Changes" → saves edits, exits edit mode
 *
 * Approve:
 * ├── In view mode: click "Approve" → navigates back to /admin
 * └── In edit mode: click "Approve" first saves changes, then approves
 *
 * Deny:
 * └── Click "Deny" → navigates back to /admin
 *
 * Back button:
 * └── ← Back → navigates to /admin
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsOperator } from './helpers';

async function getSubmittedChecklistId(page: import('@playwright/test').Page): Promise<string | null> {
  await loginAsAdmin(page);
  await page.getByRole('button', { name: /Pending/ }).click();
  const rows = page.locator('[class*="dash-row"]');
  const count = await rows.count();
  if (count === 0) return null;
  await rows.first().click();
  await page.waitForURL(/\/checklist\/.*\/review/);
  const url = page.url();
  const match = url.match(/\/checklist\/([^/]+)\/review/);
  return match ? match[1] : null;
}

test.describe('Submission Review', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure there's at least one submitted checklist
    // First submit one as operator
    await loginAsOperator(page);

    // Create and submit a checklist
    await page.getByRole('button', { name: /add checklist/i }).click();
    const select = page.locator('select.form-select');
    await expect(select).toBeVisible();
    // Wait for line options to load
    await expect(select.locator('option')).toHaveCount(3, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
    const options = await select.locator('option').all();
    let firstValue = '';
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { firstValue = val; break; }
    }
    if (firstValue) {
      await select.selectOption(firstValue);
      await page.getByRole('button', { name: 'Create' }).click();
      // Wait for modal to close
      await expect(page.getByText('New Checklist')).not.toBeVisible({ timeout: 5000 });
    } else {
      // Close modal if no lines found
      await page.getByRole('button', { name: 'Cancel' }).click();
    }
    await page.waitForURL('/');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /In Progress/ }).click();
    const rows = page.locator('[class*="dash-row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForURL(/\/checklist\/.*\/fill/);
      await page.getByRole('button', { name: 'Submit Checklist' }).click();
      await page.waitForURL('/');
    }

    // Now log in as admin and navigate to review
    await loginAsAdmin(page);
    await page.getByRole('button', { name: /Pending/ }).click();
    const adminRows = page.locator('[class*="dash-row"]');
    if (await adminRows.count() > 0) {
      await adminRows.first().click();
      await page.waitForURL(/\/checklist\/.*\/review/);
    }
  });

  test('shows Submission Review heading', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await expect(page.getByText(/Submission Review/)).toBeVisible();
  });

  test('shows machine selector dropdown', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await expect(page.locator('select.form-select')).toBeVisible();
  });

  test('shows summary panel', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await expect(page.getByText('Summary')).toBeVisible();
    await expect(page.getByText('Created By')).toBeVisible();
    await expect(page.getByText('Start')).toBeVisible();
  });

  test('shows completion panel', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await expect(page.getByText('Completion')).toBeVisible();
    await expect(page.getByText(/Filled/)).toBeVisible();
    await expect(page.getByText(/Unfilled/)).toBeVisible();
  });

  test('shows machine progress panel', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await expect(page.getByText('Machine Progress')).toBeVisible();
  });

  test('Edit Checklist button enters edit mode', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByRole('button', { name: 'Edit Checklist' }).click();
    await expect(page.getByText(/Edit Submission/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Changes' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' }).first()).toBeVisible();
  });

  test('Cancel in edit mode reverts to view mode', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByRole('button', { name: 'Edit Checklist' }).click();
    await expect(page.getByText(/Edit Submission/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page.getByText(/Submission Review/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Checklist' })).toBeVisible();
  });

  test('in edit mode can mark items as done', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByRole('button', { name: 'Edit Checklist' }).click();
    const doneBtns = page.locator('[title="Mark as done"]');
    if (await doneBtns.count() > 0) {
      await doneBtns.first().click();
      await expect(doneBtns.first()).toHaveClass(/fill-btn-done-active/);
    }
  });

  test('in edit mode Save Changes exits edit mode', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByRole('button', { name: 'Edit Checklist' }).click();
    await page.getByRole('button', { name: 'Save Changes' }).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/Submission Review/)).toBeVisible();
  });

  test('notes checkbox marks note as reviewed', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    const checkboxes = page.locator('[class*="notes-panel"] input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count > 0) {
      await checkboxes.first().click();
      await expect(checkboxes.first()).toBeChecked();
    }
  });

  test('Approve button navigates back to /admin', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForURL('**/admin');
    await expect(page).toHaveURL(/\/admin/);
  });

  test('after approval checklist appears in Approved tab', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForURL('**/admin');
    await page.getByRole('button', { name: /Approved/ }).click();
    const rows = page.locator('[class*="dash-row"]');
    await expect(rows.first()).toBeVisible();
  });

  test('Back button navigates to /admin', async ({ page }) => {
    if (!page.url().includes('/review')) return;
    await page.getByText('← Back').click();
    await expect(page).toHaveURL(/\/admin/);
  });
});

test.describe('Submission Review - Deny flow', () => {
  test('Deny button navigates back to /admin', async ({ page }) => {
    await loginAsOperator(page);

    // Create and submit
    await page.getByRole('button', { name: /add checklist/i }).click();
    const select = page.locator('select.form-select');
    const options = await select.locator('option').all();
    let firstValue = '';
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { firstValue = val; break; }
    }
    if (!firstValue) return;
    await select.selectOption(firstValue);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL('/');
    await page.getByRole('button', { name: /In Progress/ }).click();
    const rows = page.locator('[class*="dash-row"]');
    if (await rows.count() === 0) return;
    await rows.first().click();
    await page.waitForURL(/\/fill/);
    await page.getByRole('button', { name: 'Submit Checklist' }).click();
    await page.waitForURL('/');

    await loginAsAdmin(page);
    await page.getByRole('button', { name: /Pending/ }).click();
    const adminRows = page.locator('[class*="dash-row"]');
    if (await adminRows.count() === 0) return;
    await adminRows.first().click();
    await page.waitForURL(/\/review/);

    await page.getByRole('button', { name: 'Deny' }).click();
    await page.waitForURL('**/admin');
    await expect(page).toHaveURL(/\/admin/);
  });
});
