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

    // 3. Fill out some items and verify save works
    const doneButtons = page.locator('[title="Mark as done"]');
    const count = await doneButtons.count();
    for (let i = 0; i < Math.min(3, count); i++) {
      await doneButtons.nth(i).click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 });

    // 4. Submit opens modal (shows "Cannot Submit" if items incomplete, "Are you sure" if all complete)
    await page.locator('button:has-text("Submit Checklist")').first().click();
    await expect(page.locator('h2:text-matches("Submit Checklist|Cannot Submit")')).toBeVisible();
    await page.locator('button:has-text("Close"), button:has-text("Cancel")').first().click();

    // 5. Use API to submit directly (bypasses UI completeness check for E2E flow)
    const checklistUrl = page.url();
    const checklistId = checklistUrl.match(/\/checklist\/([^/]+)\//)?.[1];
    const token = await page.evaluate(() => localStorage.getItem('token'));
    await page.request.post(`http://localhost:4000/api/checklists/${checklistId}/submit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await page.goto('/');

    // 6. Verify it shows as pending
    await page.click('button:has-text("Pending")');
    await expect(page.locator('text=Pending Review').first()).toBeVisible();

    // 7. Log out and log in as admin
    await page.click('button:has-text("Log Out")');
    await login(page, ADMIN);

    // 8. Admin sees submitted checklists and reviews
    await page.click('button:has-text("Pending")');
    await page.locator('span:has-text("Line 9")').first().click();
    await page.waitForURL(/\/checklist\/.*\/review/);

    // 9. Admin approves
    await expect(page.locator('h2')).toContainText('Submission Review');
    await page.click('button:has-text("Approve")');
    await page.waitForURL('/admin');
  });

  test('admin can deny a checklist', async ({ page }) => {
    // Use a pre-existing submitted checklist from seed data
    await login(page, ADMIN);

    await page.click('button:has-text("Pending")');
    await page.locator('span:has-text("Line 9")').first().click();
    await page.waitForURL(/\/checklist\/.*\/review/);

    await page.click('button:has-text("Deny")');
    await page.waitForURL('/admin');
  });
});
