import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login } from './helpers';

test.describe('Settings & Role Assignment', () => {
  test('operator sees their profile', async ({ page }) => {
    await login(page, OPERATOR);
    await page.click('text=Settings');
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('text=Gabriel Sanchez')).toBeVisible();
    await expect(page.locator('text=Operator')).toBeVisible();
  });

  test('admin sees their profile with admin badge', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('text=Settings');
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('text=Yolanda Martinez')).toBeVisible();
    await expect(page.locator('text=Administrator')).toBeVisible();
  });

  test('admin sees role assignment link', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('text=Settings');
    await expect(page.locator('text=Edit Role Assignments')).toBeVisible();
  });

  test('admin can access role assignment page', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/settings/roles');
    await expect(page.locator('text=Add New User')).toBeVisible();
    await expect(page.locator('text=Current Users')).toBeVisible();
  });

  test('role assignment shows all users', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/settings/roles');
    await expect(page.locator('text=Yolanda Martinez')).toBeVisible();
    await expect(page.locator('text=Gabriel Sanchez')).toBeVisible();
    await expect(page.locator('text=Marcus Rivera')).toBeVisible();
  });

  test('back navigates to dashboard', async ({ page }) => {
    await login(page, OPERATOR);
    await page.click('text=Settings');
    await page.click('text=Back');
    await expect(page).toHaveURL('/');
  });
});
