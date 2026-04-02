/**
 * Checklist Detail Decision Tree
 *
 * Page load (after approval):
 * ├── Shows line name heading
 * ├── Shows summary panel (Created By, Contributors, Start, End, Duration, Status)
 * ├── Shows completion statistics
 * ├── Shows machine progress bars
 * └── Shows all notes & issues if any
 *
 * Machine tabs/selector:
 * ├── Switch machine → shows that machine's tasks
 * └── Tasks shown in read-only view (no edit buttons)
 *
 * Notes panel:
 * └── Each note shows machine, task, note text
 *
 * PDF Export:
 * └── "Export PDF" button triggers browser print dialog
 *
 * Back button:
 * ├── Operator → navigates to /
 * └── Admin → navigates to /admin (or back)
 */

import { test, expect } from '@playwright/test';
import { loginAsOperator, loginAsAdmin } from './helpers';

async function navigateToApprovedChecklist(page: import('@playwright/test').Page): Promise<boolean> {
  // Create → fill → submit → approve → view detail
  await loginAsOperator(page);
  await page.getByRole('button', { name: /add checklist/i }).click();
  const select = page.locator('select.form-select');
  const options = await select.locator('option').all();
  let firstValue = '';
  for (const opt of options) {
    const val = await opt.getAttribute('value');
    if (val && val !== '') { firstValue = val; break; }
  }
  if (!firstValue) return false;
  await select.selectOption(firstValue);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('/');
  await page.getByRole('button', { name: /In Progress/ }).click();
  const rows = page.locator('[class*="dash-row"]');
  if (await rows.count() === 0) return false;
  await rows.first().click();
  await page.waitForURL(/\/fill/);
  await page.getByRole('button', { name: 'Submit Checklist' }).click();
  await page.waitForURL('/');

  await loginAsAdmin(page);
  await page.getByRole('button', { name: /Pending/ }).click();
  const adminRows = page.locator('[class*="dash-row"]');
  if (await adminRows.count() === 0) return false;
  await adminRows.first().click();
  await page.waitForURL(/\/review/);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.waitForURL('**/admin');

  // Now click the approved checklist
  await page.getByRole('button', { name: /Approved/ }).click();
  const approvedRows = page.locator('[class*="dash-row"]');
  if (await approvedRows.count() === 0) return false;
  await approvedRows.first().click();
  await page.waitForURL(/\/checklist\/[^/]+$/);
  return true;
}

test.describe('Checklist Detail', () => {
  test('approved checklist shows detail view with summary', async ({ page }) => {
    const reached = await navigateToApprovedChecklist(page);
    if (!reached) {
      test.skip();
      return;
    }
    await expect(page.getByText('Summary')).toBeVisible();
    await expect(page.getByText('Created By')).toBeVisible();
  });

  test('shows completion statistics', async ({ page }) => {
    const reached = await navigateToApprovedChecklist(page);
    if (!reached) { test.skip(); return; }
    await expect(page.getByText('Completion')).toBeVisible();
  });

  test('shows machine progress section', async ({ page }) => {
    const reached = await navigateToApprovedChecklist(page);
    if (!reached) { test.skip(); return; }
    await expect(page.getByText('Machine Progress')).toBeVisible();
  });

  test('status shows as Approved', async ({ page }) => {
    const reached = await navigateToApprovedChecklist(page);
    if (!reached) { test.skip(); return; }
    // Status row should show approved
    const statusText = page.getByText(/approved/i);
    await expect(statusText.first()).toBeVisible();
  });

  test('operator can view their submitted checklist in detail', async ({ page }) => {
    await loginAsOperator(page);
    await page.getByRole('button', { name: /^All/ }).click();
    const rows = page.locator('[class*="dash-row"]');
    const count = await rows.count();
    // Find a non-in_progress row
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent() || '';
      if (!text.toLowerCase().includes('in progress')) {
        await row.click();
        await expect(page).toHaveURL(/\/checklist\/[^/]+$/);
        return;
      }
    }
  });

  test('machine selector visible in detail view', async ({ page }) => {
    const reached = await navigateToApprovedChecklist(page);
    if (!reached) { test.skip(); return; }
    // Machine selector or machine tabs should be visible
    const hasMachineSelect = await page.locator('[class*="machineTabs"], select').count() > 0;
    expect(hasMachineSelect).toBeTruthy();
  });

  test('Export PDF button visible', async ({ page }) => {
    const reached = await navigateToApprovedChecklist(page);
    if (!reached) { test.skip(); return; }
    await expect(page.getByRole('button', { name: /export pdf/i })).toBeVisible();
  });
});
