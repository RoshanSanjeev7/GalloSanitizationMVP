import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login, logout } from './helpers';

test.describe('Authentication', () => {
  test('shows login page by default', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1')).toHaveText('Sign In');
  });

  test('operator login redirects to operator dashboard', async ({ page }) => {
    await login(page, OPERATOR);
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('admin login redirects to admin dashboard', async ({ page }) => {
    await login(page, ADMIN);
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('h1')).toHaveText('Sanitation Audit Log');
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@gallo.com');
    await page.fill('input[type="password"]', 'wrong');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('logout returns to login page', async ({ page }) => {
    await login(page, OPERATOR);
    await logout(page);
    await expect(page).toHaveURL('/login');
  });

  test('protected routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/login');
  });
});
