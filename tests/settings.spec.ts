/**
 * Settings Decision Tree
 *
 * Page load (admin):
 * ├── Shows user name
 * ├── Shows user email
 * ├── Shows "Administrator" role badge
 * ├── Shows "Home" link → /admin
 * └── Shows "Edit Role Assignments" link → /settings/roles
 *
 * Page load (operator):
 * ├── Shows user name
 * ├── Shows user email
 * ├── Shows "Operator" role badge
 * ├── Shows "Home" link → /
 * └── Does NOT show "Edit Role Assignments" link
 *
 * Navigation:
 * ├── Home link → navigates to role-appropriate home
 * ├── Edit Role Assignments (admin only) → /settings/roles
 * └── ← Settings (back) → navigates to role-appropriate home
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsOperator, ADMIN, OPERATOR_1 } from './helpers';

test.describe('Settings - Admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
  });

  test('shows admin user name', async ({ page }) => {
    await expect(page.locator('.card h2').first()).toBeVisible();
  });

  test('shows admin email', async ({ page }) => {
    await expect(page.getByText(ADMIN.email)).toBeVisible();
  });

  test('shows Administrator badge', async ({ page }) => {
    await expect(page.getByText('Administrator')).toBeVisible();
  });

  test('shows Home link to /admin', async ({ page }) => {
    const homeLink = page.getByRole('link', { name: 'Home' });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('shows Edit Role Assignments link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Edit Role Assignments' })).toBeVisible();
  });

  test('Edit Role Assignments link navigates to /settings/roles', async ({ page }) => {
    await page.getByRole('link', { name: 'Edit Role Assignments' }).click();
    await expect(page).toHaveURL('/settings/roles');
  });

  test('back link navigates to /admin', async ({ page }) => {
    await page.getByText('← Settings').click();
    await expect(page).toHaveURL(/\/admin/);
  });
});

test.describe('Settings - Operator', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/settings');
  });

  test('shows operator email', async ({ page }) => {
    await expect(page.getByText(OPERATOR_1.email)).toBeVisible();
  });

  test('shows Operator badge', async ({ page }) => {
    await expect(page.getByText('Operator')).toBeVisible();
  });

  test('shows Home link to /', async ({ page }) => {
    const homeLink = page.getByRole('link', { name: 'Home' });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL('/');
  });

  test('does NOT show Edit Role Assignments link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Edit Role Assignments' })).not.toBeVisible();
  });

  test('back link navigates to /', async ({ page }) => {
    await page.getByText('← Settings').click();
    await expect(page).toHaveURL('/');
  });
});
