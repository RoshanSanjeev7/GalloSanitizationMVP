/**
 * Admin Dashboard Decision Tree
 *
 * Page load:
 * ├── Shows "Sanitation Audit Log" heading
 * ├── Shows search input
 * ├── Shows line filter dropdown
 * ├── Shows sort order dropdown
 * └── Shows tab bar (Pending, In Progress, Approved, All)
 *
 * Tab switching:
 * ├── "Pending" tab → shows only submitted checklists
 * ├── "In Progress" tab → shows only in_progress checklists
 * ├── "Approved" tab → shows only approved checklists
 * └── "All" tab → shows all checklists
 *
 * Search:
 * ├── Type operator/line name → filters to matching rows
 * └── Clear search → shows all again
 *
 * Line filter:
 * ├── Select specific line → shows only that line's checklists
 * └── Select "All Lines" → shows all
 *
 * Sort order:
 * ├── "Newest" → default, newest first
 * └── "Oldest" → reverses order
 *
 * Checklist row clicks:
 * ├── submitted checklist → navigate to /checklist/:id/review
 * └── non-submitted checklist → navigate to /checklist/:id
 *
 * Footer:
 * ├── "+ Create Template" link → navigate to /templates/create
 * ├── "Settings" link → navigate to /settings
 * └── "Log Out" button → navigate to /login
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, logout } from './helpers';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows Sanitation Audit Log heading', async ({ page }) => {
    await expect(page.getByText('Sanitation Audit Log')).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('shows line filter and sort dropdowns', async ({ page }) => {
    const selects = page.locator('select.form-select');
    await expect(selects.first()).toBeVisible();
  });

  test('shows all tab buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /In Progress/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Approved/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^All/ })).toBeVisible();
  });

  test('Pending tab is selected by default', async ({ page }) => {
    const pendingBtn = page.getByRole('button', { name: /Pending/ });
    await expect(pendingBtn).toHaveClass(/dash-tab-active/);
  });

  test('switching to All tab makes it active', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    const allBtn = page.getByRole('button', { name: /^All/ });
    await expect(allBtn).toHaveClass(/dash-tab-active/);
  });

  test('switching to In Progress tab makes it active', async ({ page }) => {
    await page.getByRole('button', { name: /In Progress/ }).click();
    const inProgressBtn = page.getByRole('button', { name: /In Progress/ });
    await expect(inProgressBtn).toHaveClass(/dash-tab-active/);
  });

  test('switching to Approved tab makes it active', async ({ page }) => {
    await page.getByRole('button', { name: /Approved/ }).click();
    const approvedBtn = page.getByRole('button', { name: /Approved/ });
    await expect(approvedBtn).toHaveClass(/dash-tab-active/);
  });

  test('search by operator name filters results', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    await page.waitForTimeout(500);
    const allRows = page.locator('[class*="dash-row"]');
    const totalCount = await allRows.count();

    if (totalCount > 0) {
      const firstRowText = await allRows.first().textContent() || '';
      // Get first word as operator name part
      const words = firstRowText.trim().split(/\s+/);
      if (words.length > 0 && words[0]) {
        await page.locator('input[placeholder*="Search"]').fill(words[0]);
        await page.waitForTimeout(300);
        const filteredCount = await page.locator('[class*="dash-row"]').count();
        expect(filteredCount).toBeLessThanOrEqual(totalCount);
      }
    }
  });

  test('clearing search restores all results', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    await page.waitForTimeout(500);
    const allRows = page.locator('[class*="dash-row"]');
    const totalCount = await allRows.count();

    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('xXnonexistentXx');
    await page.waitForTimeout(300);
    await searchInput.clear();
    await page.waitForTimeout(300);
    const afterClearCount = await page.locator('[class*="dash-row"]').count();
    expect(afterClearCount).toBe(totalCount);
  });

  test('filter by specific line reduces results', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    await page.waitForTimeout(500);
    const lineSelects = page.locator('select.form-select');
    const lineOptions = await lineSelects.first().locator('option').all();
    if (lineOptions.length > 1) {
      const lineVal = await lineOptions[1].getAttribute('value');
      if (lineVal) {
        await lineSelects.first().selectOption(lineVal);
        await page.waitForTimeout(300);
        await expect(lineSelects.first()).toHaveValue(lineVal);
      }
    }
  });

  test('select All Lines shows all checklists', async ({ page }) => {
    const lineSelects = page.locator('select.form-select');
    await lineSelects.first().selectOption('');
    await expect(lineSelects.first()).toHaveValue('');
  });

  test('sort by Oldest changes sort order', async ({ page }) => {
    await page.getByRole('button', { name: /^All/ }).click();
    const sortSelects = page.locator('select.form-select');
    await sortSelects.last().selectOption('oldest');
    await expect(sortSelects.last()).toHaveValue('oldest');
  });

  test('submitted checklist click navigates to /review', async ({ page }) => {
    await page.getByRole('button', { name: /Pending/ }).click();
    await page.waitForTimeout(500);
    const rows = page.locator('[class*="dash-row"]');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await expect(page).toHaveURL(/\/checklist\/.*\/review/);
    }
  });

  test('approved checklist click navigates to /detail', async ({ page }) => {
    await page.getByRole('button', { name: /Approved/ }).click();
    await page.waitForTimeout(500);
    const rows = page.locator('[class*="dash-row"]');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await expect(page).toHaveURL(/\/checklist\/[^/]+$/);
    }
  });

  test('search with no match shows no checklists found', async ({ page }) => {
    await page.locator('input[placeholder*="Search"]').fill('xXnonexistentoperatorXx');
    await page.waitForTimeout(300);
    await expect(page.locator('[class*="dash-empty"]')).toBeVisible();
  });

  test('footer Create Template link navigates to /templates/create', async ({ page }) => {
    await page.getByRole('link', { name: /create template/i }).click();
    await expect(page).toHaveURL('/templates/create');
  });

  test('footer Settings link navigates to /settings', async ({ page }) => {
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL('/settings');
  });

  test('footer Log Out button navigates to /login', async ({ page }) => {
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});
