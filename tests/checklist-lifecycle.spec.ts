import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login } from './helpers';

test.describe('Checklist Lifecycle (create → fill → submit → approve)', () => {
  test('full operator → admin workflow', async ({ page }) => {
    // 1. Operator creates a new checklist
    await login(page, OPERATOR);
    await page.click('button:has-text("Add Checklist")');
    await expect(page.locator('h2:has-text("New Checklist")')).toBeVisible();
    await page.locator('select.form-select').last().selectOption({ label: 'Line 91' });
    await page.locator('button:has-text("Create")').click();
    await expect(page.locator('h2:has-text("New Checklist")')).not.toBeVisible();
    await page.waitForTimeout(500);

    // 2. Click the newly created in-progress checklist to fill it
    await page.click('button:has-text("In Progress")');
    await page.locator('text=Line').first().click();
    await page.waitForURL(/\/checklist\/.*\/fill/);

    // 3. Fill out some items
    const doneButtons = page.locator('[title="Mark as done"]');
    const count = await doneButtons.count();
    for (let i = 0; i < Math.min(3, count); i++) {
      await doneButtons.nth(i).click();
      await page.waitForTimeout(200);
    }

    // 4. Submit the checklist
    await page.locator('button:has-text("Submit Checklist")').first().click();
    await expect(page.locator('text=Are you sure')).toBeVisible();
    await page.locator('button:has-text("Submit")').last().click();
    await page.waitForURL('/', { timeout: 10000 });

    // 5. Verify it shows as pending
    await page.click('button:has-text("Pending")');
    await expect(page.locator('text=Pending Review').first()).toBeVisible();

    // 6. Log out and log in as admin
    await page.click('button:has-text("Log Out")');
    await login(page, ADMIN);

    // 7. Admin sees submitted checklists
    await page.click('button:has-text("Pending")');
    await expect(page.locator('text=Pending').first()).toBeVisible();

    // 8. Admin opens the review page
    await page.locator('span:has-text("Line 9")').first().click();
    await page.waitForURL(/\/checklist\/.*\/review/);

    // 9. Admin approves
    await expect(page.locator('h2')).toContainText('Submission Review');
    await page.click('button:has-text("Approve")');
    await page.waitForURL('/admin');
  });

  test('admin can deny a checklist', async ({ page }) => {
    // Create and submit a checklist as operator
    await login(page, OPERATOR);
    await page.click('button:has-text("Add Checklist")');
    await expect(page.locator('h2:has-text("New Checklist")')).toBeVisible();
    await page.locator('select.form-select').last().selectOption({ label: 'Line 91' });
    await page.locator('button:has-text("Create")').click();
    await expect(page.locator('h2:has-text("New Checklist")')).not.toBeVisible();
    await page.waitForTimeout(500);

    // Navigate to fill and submit
    await page.click('button:has-text("In Progress")');
    await page.locator('text=Line').first().click();
    await page.waitForURL(/\/checklist\/.*\/fill/);

    await page.locator('button:has-text("Submit Checklist")').first().click();
    await expect(page.locator('text=Are you sure')).toBeVisible();
    await page.locator('button:has-text("Submit")').last().click();
    await page.waitForURL('/', { timeout: 10000 });

    // Login as admin and deny
    await page.click('button:has-text("Log Out")');
    await login(page, ADMIN);

    await page.click('button:has-text("Pending")');
    await page.locator('span:has-text("Line 9")').first().click();
    await page.waitForURL(/\/checklist\/.*\/review/);

    await page.click('button:has-text("Deny")');
    await page.waitForURL('/admin');
  });
});
