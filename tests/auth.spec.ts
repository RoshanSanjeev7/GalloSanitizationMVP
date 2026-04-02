/**
 * Auth Decision Tree
 *
 * Login page actions:
 * ├── Submit with valid admin credentials
 * │   └── Redirects to /admin (AdminDashboard)
 * ├── Submit with valid operator credentials
 * │   └── Redirects to / (OperatorDashboard)
 * ├── Submit with wrong password
 * │   └── Shows error message, stays on /login
 * ├── Submit with unknown email
 * │   └── Shows error message, stays on /login
 * ├── Submit with empty email
 * │   └── Browser validation prevents submit
 * ├── Submit with empty password
 * │   └── Browser validation prevents submit
 * └── Access protected route when unauthenticated
 *     └── Redirects to /login
 *
 * Logout:
 * ├── Operator clicks Log Out → redirects to /login
 * └── Admin clicks Log Out → redirects to /login
 */

import { test, expect } from '@playwright/test';
import { login, loginAsAdmin, loginAsOperator, logout, ADMIN, OPERATOR_1 } from './helpers';

test.describe('Authentication', () => {
  test('admin login redirects to /admin', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForURL('**/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText('Sanitation Audit Log')).toBeVisible();
  });

  test('operator login redirects to /', async ({ page }) => {
    await login(page, OPERATOR_1.email, OPERATOR_1.password);
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/Welcome,/)).toBeVisible();
  });

  test('wrong password shows error', async ({ page }) => {
    await login(page, ADMIN.email, 'wrongpassword');
    await expect(page.locator('p.error, [class*="error"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unknown email shows error', async ({ page }) => {
    await login(page, 'nobody@gallo.com', 'somepass');
    await expect(page.locator('p.error, [class*="error"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('empty email triggers browser validation (form not submitted)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="password"]', 'somepass');
    await page.click('button[type="submit"]');
    // Form should not navigate away
    await expect(page).toHaveURL(/\/login/);
  });

  test('empty password triggers browser validation (form not submitted)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN.email);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });

  test('accessing /admin unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('accessing protected checklist route unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/checklist/nonexistent/fill');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('operator logout redirects to /login', async ({ page }) => {
    await loginAsOperator(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test('admin logout redirects to /login', async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test('demo credentials displayed on login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Demo Credentials')).toBeVisible();
    await expect(page.getByText(/ymartinez@gallo\.com/)).toBeVisible();
    await expect(page.getByText(/gsanchez@gallo\.com/)).toBeVisible();
  });
});
