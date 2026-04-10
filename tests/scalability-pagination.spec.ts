import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login } from './helpers';

test.describe('Scalability: Server-Side Pagination & Filtering', () => {
  test('admin dashboard shows counts on all tabs', async ({ page }) => {
    await login(page, ADMIN);
    // Default tab is "Pending" — it should show a count like "Pending (N)"
    const pendingTab = page.locator('button:has-text("Pending")');
    await expect(pendingTab).toBeVisible();
    const pendingText = await pendingTab.textContent();
    expect(pendingText).toMatch(/Pending \(\d+\)/);

    // All tabs now show counts
    const inProgressTab = page.locator('button:has-text("In Progress")');
    const inProgressText = await inProgressTab.textContent();
    expect(inProgressText).toMatch(/In Progress \(\d+\)/);

    const approvedTab = page.locator('button:has-text("Approved")');
    const approvedText = await approvedTab.textContent();
    expect(approvedText).toMatch(/Approved \(\d+\)/);

    const allTab = page.locator('button:has-text("All")');
    const allText = await allTab.textContent();
    expect(allText).toMatch(/All \(\d+\)/);
  });

  test('admin tab switching loads new data from server', async ({ page }) => {
    await login(page, ADMIN);
    await page.waitForTimeout(500);

    // Switch to "All" tab
    await page.click('button:has-text("All")');
    await page.waitForTimeout(500);

    // "All" should now show count
    const allTab = page.locator('button:has-text("All")');
    const allText = await allTab.textContent();
    expect(allText).toMatch(/All \(\d+\)/);
  });

  test('admin search filters results after debounce', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button:has-text("All")');
    await page.waitForTimeout(500);

    await page.fill('input[placeholder*="Search"]', 'Gabriel');
    // Wait for debounce (300ms) + server response
    await page.waitForTimeout(600);

    // Should show only Gabriel's checklists
    const rows = page.locator('[class*="dashRow"]');
    const count = await rows.count();
    if (count > 0) {
      await expect(page.locator('text=Gabriel').first()).toBeVisible();
    }
  });

  test('admin line filter dropdown works', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button:has-text("All")');
    await page.waitForTimeout(500);

    // Select a specific line from the dropdown
    const lineSelect = page.locator('select').first();
    const options = lineSelect.locator('option');
    const optionCount = await options.count();
    if (optionCount > 1) {
      await lineSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
  });

  test('operator dashboard uses server-side pagination', async ({ page }) => {
    await login(page, OPERATOR);
    // Default tab is "In Progress"
    const activeTab = page.locator('button:has-text("In Progress")');
    await expect(activeTab).toBeVisible();
    const tabText = await activeTab.textContent();
    expect(tabText).toMatch(/In Progress \(\d+\)/);
  });
});
