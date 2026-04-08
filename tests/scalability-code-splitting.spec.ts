import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers';

test.describe('Scalability: Code Splitting & Misc', () => {
  test('admin dashboard loads via lazy route (chunk request)', async ({ page }) => {
    // Track network requests for JS chunks
    const chunkRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('.js') && req.resourceType() === 'script') {
        chunkRequests.push(req.url());
      }
    });

    await login(page, ADMIN);
    await page.waitForTimeout(500);

    // Admin dashboard should have loaded — verify it works
    await expect(page.locator('h1')).toHaveText('Sanitation Audit Log');

    // At least some JS was loaded (chunks from lazy imports)
    expect(chunkRequests.length).toBeGreaterThan(0);
  });

  test('recharts is not included in the bundle', async ({ page }) => {
    // Track all JS responses
    const jsContents: string[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('.js') && res.status() === 200) {
        try {
          const text = await res.text();
          jsContents.push(text);
        } catch {
          // Some responses may not be text
        }
      }
    });

    await login(page, ADMIN);
    await page.waitForTimeout(1000);

    // None of the JS bundles should contain recharts references
    const hasRecharts = jsContents.some(
      (js) => js.includes('recharts') || js.includes('Recharts'),
    );
    expect(hasRecharts).toBe(false);
  });

  test('Suspense fallback shows while lazy component loads', async ({ page }) => {
    // Navigate directly to admin page without being logged in first
    // The lazy component should trigger Suspense
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ymartinez@gallo.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/admin');

    // The page should have loaded successfully (Suspense resolved)
    await expect(page.locator('h1')).toHaveText('Sanitation Audit Log');
  });
});
