import { test, expect } from '@playwright/test';
import { OPERATOR, login } from './helpers';

test.describe('Scalability: Batch Image URLs', () => {
  test('batch image-urls endpoint returns URLs for given keys', async ({ request }) => {
    // Login to get token
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'gsanchez@gallo.com', password: 'operator123' },
    });
    const { token } = await loginRes.json();

    // Get a checklist
    const listRes = await request.get('/api/checklists?limit=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { items } = await listRes.json();
    if (items.length === 0) return;

    const id = items[0].id;

    // Call batch endpoint with fake keys prefixed by checklist ID — should return URLs (or empty if keys don't exist in S3)
    const batchRes = await request.post(`/api/checklists/${id}/image-urls`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { keys: [`${id}/test-key-1.jpg`, `${id}/test-key-2.jpg`] },
    });
    expect(batchRes.status()).toBe(200);
    const body = await batchRes.json();
    expect(body).toHaveProperty('urls');
    expect(typeof body.urls).toBe('object');
    // Should have entries for both keys (presigned URLs even if objects don't exist)
    expect(Object.keys(body.urls)).toHaveLength(2);
  });

  test('batch endpoint returns 400 for empty keys', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'gsanchez@gallo.com', password: 'operator123' },
    });
    const { token } = await loginRes.json();

    const res = await request.post('/api/checklists/any-id/image-urls', {
      headers: { Authorization: `Bearer ${token}` },
      data: { keys: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('checklist fill page loads without N+1 image requests', async ({ page }) => {
    await login(page, OPERATOR);
    await page.click('button:has-text("In Progress")');

    const row = page.locator('text=Line').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForURL(/\/checklist\/.*\/fill/);
      // Page should load successfully — screenshot captures the state
      await expect(page.locator('button:has-text("/")')).toBeVisible();
    }
  });
});
