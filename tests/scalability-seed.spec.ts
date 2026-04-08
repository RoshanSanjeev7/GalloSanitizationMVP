import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, OPERATOR2, login } from './helpers';

test.describe('Scalability: Seed Safety', () => {
  test('admin user can login with seeded credentials', async ({ page }) => {
    await login(page, ADMIN);
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('h1')).toHaveText('Sanitation Audit Log');
  });

  test('operator 1 can login with seeded credentials', async ({ page }) => {
    await login(page, OPERATOR);
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome, Gabriel')).toBeVisible();
  });

  test('operator 2 can login with seeded credentials', async ({ page }) => {
    await login(page, OPERATOR2);
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome, Marcus')).toBeVisible();
  });

  test('seeded lines appear in admin line filter', async ({ page }) => {
    await login(page, ADMIN);
    // Wait for data to load (lines fetch is async)
    await page.waitForTimeout(1000);

    // The line filter select contains "All Lines" as first option
    const lineSelect = page.locator('select:has(option:has-text("All Lines"))').first();
    await expect(lineSelect).toBeVisible();

    // Options inside a closed <select> are hidden, so check their count/text via evaluate
    const optionTexts = await lineSelect.locator('option').allTextContents();
    expect(optionTexts.some((t) => t.includes('Line 91'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('Line 92'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('Line 93'))).toBe(true);
  });
});
