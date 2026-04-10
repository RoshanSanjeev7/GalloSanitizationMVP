import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login } from './helpers';

test.describe('Scalability: JWT Token Improvements', () => {
  test('login returns JWT with 8-hour expiry', async ({ page }) => {
    await login(page, OPERATOR);

    // Read the token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Decode JWT payload (base64)
    const payload = JSON.parse(
      Buffer.from(token!.split('.')[1], 'base64').toString(),
    );
    expect(payload.userId).toBeDefined();
    expect(payload.role).toBe('operator');
    expect(payload.exp).toBeDefined();

    // Verify expiry is ~8 hours from now
    const expiresIn = payload.exp * 1000 - Date.now();
    const eightHoursMs = 8 * 60 * 60 * 1000;
    expect(expiresIn).toBeLessThanOrEqual(eightHoursMs + 5000); // 8h + 5s tolerance
    expect(expiresIn).toBeGreaterThan(eightHoursMs - 60000); // At least 7h 59m
  });

  test('refresh endpoint returns new valid token', async ({ request }) => {
    // Login
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'ymartinez@gallo.com', password: 'admin123' },
    });
    const { token } = await loginRes.json();

    // Refresh
    const refreshRes = await request.post('/api/auth/refresh', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(refreshRes.status()).toBe(200);

    const body = await refreshRes.json();
    expect(body.token).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.role).toBe('admin');
    expect(body.user.password).toBeUndefined(); // No password leak

    // New token should be a valid JWT string
    expect(body.token.split('.')).toHaveLength(3);
  });

  test('refresh endpoint rejects invalid token', async ({ request }) => {
    const res = await request.post('/api/auth/refresh', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status()).toBe(401);
  });
});
