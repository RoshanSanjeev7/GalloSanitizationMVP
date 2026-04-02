/**
 * Role Assignment Decision Tree
 *
 * Page load:
 * ├── Shows "Add New User" card
 * │   ├── Full Name input
 * │   ├── Email input
 * │   ├── Role toggle (Operator / Administrator)
 * │   └── "Add User" button
 * └── Shows "Current Users" card with user list
 *
 * Add User button:
 * ├── Disabled when name is empty
 * ├── Disabled when email is empty
 * └── Enabled when both name and email are filled
 *
 * Role toggle (new user):
 * ├── Default: Operator selected (has "active" class)
 * ├── Click "Administrator" → Administrator becomes active
 * └── Click "Operator" after Admin → Operator becomes active again
 *
 * Add User submission:
 * ├── With valid name + email → creates user, resets form, user appears in list
 * └── Duplicate email → shows error message
 *
 * Current Users list:
 * ├── Shows each user's name and email
 * ├── Toggle to "Admin" → role changes
 * └── Toggle to "Operator" → role reverts
 *
 * Back navigation:
 * └── ← Role Assignment → navigates to /settings
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Role Assignment', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings/roles');
    await expect(page.getByText('Add New User')).toBeVisible();
  });

  test('shows Add New User card', async ({ page }) => {
    await expect(page.getByText('Add New User')).toBeVisible();
  });

  test('shows Full Name and Email inputs', async ({ page }) => {
    await expect(page.locator('input[placeholder="Enter full name"]')).toBeVisible();
    await expect(page.locator('input[placeholder="user@gallo.com"]')).toBeVisible();
  });

  test('shows Operator and Administrator role toggle buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Operator' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Administrator' }).first()).toBeVisible();
  });

  test('Add User button disabled when both fields empty', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /Add User/ });
    await expect(addBtn).toBeDisabled();
  });

  test('Add User button disabled with only name filled', async ({ page }) => {
    await page.locator('input[placeholder="Enter full name"]').fill('Test User');
    const addBtn = page.getByRole('button', { name: /Add User/ });
    await expect(addBtn).toBeDisabled();
  });

  test('Add User button disabled with only email filled', async ({ page }) => {
    await page.locator('input[placeholder="user@gallo.com"]').fill('test@gallo.com');
    const addBtn = page.getByRole('button', { name: /Add User/ });
    await expect(addBtn).toBeDisabled();
  });

  test('Add User button enabled when both name and email filled', async ({ page }) => {
    await page.locator('input[placeholder="Enter full name"]').fill('Test User');
    await page.locator('input[placeholder="user@gallo.com"]').fill('testuser@gallo.com');
    const addBtn = page.getByRole('button', { name: /Add User/ });
    await expect(addBtn).toBeEnabled();
  });

  test('role toggle defaults to Operator (Operator button is active)', async ({ page }) => {
    // Find the role toggle in the "Add New User" card (first card)
    // The Operator button should have class "active"
    const operatorBtn = page.locator('.card').first().getByRole('button', { name: 'Operator' });
    await expect(operatorBtn).toHaveClass(/active/);
  });

  test('clicking Administrator makes it active', async ({ page }) => {
    const adminBtn = page.locator('.card').first().getByRole('button', { name: 'Administrator' });
    await adminBtn.click();
    await expect(adminBtn).toHaveClass(/active/);
  });

  test('clicking Operator after Administrator reverts to Operator active', async ({ page }) => {
    const card = page.locator('.card').first();
    const adminBtn = card.getByRole('button', { name: 'Administrator' });
    const operatorBtn = card.getByRole('button', { name: 'Operator' });
    await adminBtn.click();
    await expect(adminBtn).toHaveClass(/active/);
    await operatorBtn.click();
    await expect(operatorBtn).toHaveClass(/active/);
  });

  test('adding a new user makes them appear in users list', async ({ page }) => {
    const uniqueEmail = `pw_${Date.now()}@gallo.com`;
    await page.locator('input[placeholder="Enter full name"]').fill('Playwright Test User');
    await page.locator('input[placeholder="user@gallo.com"]').fill(uniqueEmail);
    await page.getByRole('button', { name: 'Add User' }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('Playwright Test User').first()).toBeVisible();
    await expect(page.getByText(uniqueEmail)).toBeVisible();
  });

  test('form resets after successful user creation', async ({ page }) => {
    const uniqueEmail = `pw_reset_${Date.now()}@gallo.com`;
    await page.locator('input[placeholder="Enter full name"]').fill('Reset Test User');
    await page.locator('input[placeholder="user@gallo.com"]').fill(uniqueEmail);
    await page.getByRole('button', { name: 'Add User' }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('input[placeholder="Enter full name"]')).toHaveValue('');
    await expect(page.locator('input[placeholder="user@gallo.com"]')).toHaveValue('');
  });

  test('shows Current Users card with user list', async ({ page }) => {
    await expect(page.getByText('Current Users')).toBeVisible();
    const userRows = page.locator('[class*="user-row"]');
    expect(await userRows.count()).toBeGreaterThan(0);
  });

  test('each user row shows name and email', async ({ page }) => {
    const firstRow = page.locator('[class*="user-row"]').first();
    // Name is in an h4, email is in a p element inside user-info
    await expect(firstRow.locator('h4')).toBeVisible();
    await expect(firstRow.locator('p')).toBeVisible();
  });

  test('can toggle user role between Operator and Admin', async ({ page }) => {
    const userRows = page.locator('[class*="user-row"]');
    const count = await userRows.count();
    for (let i = 0; i < count; i++) {
      const row = userRows.nth(i);
      const operatorBtn = row.getByRole('button', { name: 'Operator' });
      const classes = await operatorBtn.getAttribute('class') || '';
      if (classes.includes('active')) {
        const adminBtn = row.getByRole('button', { name: 'Admin' });
        await adminBtn.click();
        await page.waitForTimeout(800);
        await expect(adminBtn).toHaveClass(/active/);
        // Revert
        await operatorBtn.click();
        await page.waitForTimeout(800);
        return;
      }
    }
  });

  test('back link navigates to /settings', async ({ page }) => {
    await page.getByText('← Role Assignment').click();
    await expect(page).toHaveURL('/settings');
  });
});
