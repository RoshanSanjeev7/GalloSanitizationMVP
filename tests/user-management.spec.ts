import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

test.describe('User Management (Role Assignment)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/settings/roles');
    await expect(page.locator('text=Add New User')).toBeVisible();
  });

  test('shows existing users with role toggles', async ({ page }) => {
    await expect(page.locator('text=Yolanda Martinez')).toBeVisible();
    await expect(page.locator('text=Gabriel Sanchez')).toBeVisible();
    await expect(page.locator('text=Marcus Rivera')).toBeVisible();
  });

  test('can create a new user with password', async ({ page }) => {
    const email = `testuser${uid()}@gallo.com`;
    await page.fill('input[placeholder="Enter full name"]', 'Test User');
    await page.fill('input[placeholder="user@gallo.com"]', email);
    await page.fill('input[placeholder="Enter password"]', 'test123');
    await page.locator('button:has-text("Administrator")').first().click();
    // Select a factory (required — use first() to target the Add User form)
    await page.locator('label:has-text("Modesto")').first().click();
    await page.click('button:has-text("Add User")');
    await expect(page.locator(`text=${email}`)).toBeVisible({ timeout: 10000 });
  });

  test('new user can log in with their password', async ({ page }) => {
    const email = `logintest${uid()}@gallo.com`;
    await page.fill('input[placeholder="Enter full name"]', 'Login Test');
    await page.fill('input[placeholder="user@gallo.com"]', email);
    await page.fill('input[placeholder="Enter password"]', 'mypassword');
    // Select a factory (required — use first() to target the Add User form)
    await page.locator('label:has-text("Modesto")').first().click();
    await page.click('button:has-text("Add User")');
    await expect(page.locator(`text=${email}`)).toBeVisible({ timeout: 15000 });

    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'mypassword');
    await page.click('button:has-text("Sign In")');
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('role change shows confirmation and works', async ({ page }) => {
    const email = `rolechg${uid()}@gallo.com`;
    await page.fill('input[placeholder="Enter full name"]', 'RoleChg User');
    await page.fill('input[placeholder="user@gallo.com"]', email);
    await page.fill('input[placeholder="Enter password"]', 'test123');
    // Select a factory (required — use first() to target the Add User form)
    await page.locator('label:has-text("Modesto")').first().click();
    await page.click('button:has-text("Add User")');
    await expect(page.locator(`text=${email}`)).toBeVisible();

    await page.evaluate((userEmail) => {
      const emailEl = Array.from(document.querySelectorAll('p')).find(p => p.textContent === userEmail);
      if (emailEl) {
        const row = emailEl.closest('[class*="userRow"]') || emailEl.parentElement?.parentElement?.parentElement;
        const btns = Array.from(row?.querySelectorAll('button') || []);
        const admin = btns.find(b => b.textContent?.trim() === 'Admin');
        admin?.click();
      }
    }, email);

    await expect(page.locator('h2:has-text("Change Role")')).toBeVisible();
    await page.click('button:has-text("Confirm")');
    await expect(page.locator('h2:has-text("Change Role")')).not.toBeVisible();
  });

  test('delete user with confirmation', async ({ page }) => {
    const email = `delme${uid()}@gallo.com`;
    await page.fill('input[placeholder="Enter full name"]', 'Delete Me');
    await page.fill('input[placeholder="user@gallo.com"]', email);
    await page.fill('input[placeholder="Enter password"]', 'test123');
    // Select a factory (required — use first() to target the Add User form)
    await page.locator('label:has-text("Modesto")').first().click();
    await page.click('button:has-text("Add User")');
    await expect(page.locator(`text=${email}`)).toBeVisible();

    await page.locator('button:has-text("Delete")').last().click();
    await expect(page.locator('h2:has-text("Delete User")')).toBeVisible();

    const deleteResponse = page.waitForResponse(r => r.request().method() === 'DELETE');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const modalDel = btns.find(b => {
        const inModal = b.closest('[class*="modal"]');
        return inModal && b.textContent?.trim() === 'Delete';
      });
      modalDel?.click();
    });
    await deleteResponse;

    // Wait a moment for DynamoDB consistency, then reload
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('text=Current Users')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${email}`)).toBeHidden({ timeout: 10000 });
  });

  test('delete confirmation can be cancelled', async ({ page }) => {
    const email = `keepme${uid()}@gallo.com`;
    await page.fill('input[placeholder="Enter full name"]', 'Keep Me');
    await page.fill('input[placeholder="user@gallo.com"]', email);
    await page.fill('input[placeholder="Enter password"]', 'test123');
    // Select a factory (required — use first() to target the Add User form)
    await page.locator('label:has-text("Modesto")').first().click();
    await page.click('button:has-text("Add User")');
    await expect(page.locator(`text=${email}`)).toBeVisible();

    await page.locator('button:has-text("Delete")').last().click();
    await expect(page.locator('h2:has-text("Delete User")')).toBeVisible();
    await page.click('button:has-text("Cancel")');
    await expect(page.locator(`text=${email}`)).toBeVisible();
  });

  test('add user button disabled without password', async ({ page }) => {
    await page.fill('input[placeholder="Enter full name"]', 'No Pass');
    await page.fill('input[placeholder="user@gallo.com"]', 'nopass@gallo.com');
    const addBtn = page.locator('button:has-text("Add User")');
    await expect(addBtn).toBeDisabled();
  });
});
