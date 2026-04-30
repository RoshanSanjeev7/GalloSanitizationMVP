import { type Page } from '@playwright/test';

export const ADMIN = { email: 'ymartinez@gallo.com', password: 'admin123', name: 'Yolanda Martinez' };
export const OPERATOR = { email: 'gsanchez@gallo.com', password: 'operator123', name: 'Gabriel Sanchez' };
export const OPERATOR2 = { email: 'mrivera@gallo.com', password: 'operator123', name: 'Marcus Rivera' };

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/(admin)?$/);
}

export async function logout(page: Page) {
  await page.click('button:has-text("Log Out")');
  await page.waitForURL('/login');
}

/** Selects a checklist row by matching line name text */
export function checklistRow(page: Page, lineName?: string) {
  if (lineName) {
    return page.locator(`div:has(> strong:has-text("${lineName}"))`).first();
  }
  return page.locator('div:has(> strong:has-text("Line"))').first();
}

/**
 * Hook into a page's outgoing/incoming WebSocket frames and return a
 * mutable array that grows over the test's lifetime.
 *
 * Use with `expect.poll(() => frames.find(f => f.type === 'X'))` to wait
 * for a specific message without timing dependencies. Frames that don't
 * parse as JSON are silently dropped — pings/pongs are framework-level
 * and never appear here.
 *
 * Must be called BEFORE the page navigates anywhere that opens a
 * WebSocket; the listener attaches to the next websocket created on
 * the page.
 */
export type CapturedFrame = { dir: 'in' | 'out'; payload: Record<string, unknown> };

export function captureWsFrames(page: Page): CapturedFrame[] {
  const frames: CapturedFrame[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      try {
        frames.push({ dir: 'in', payload: JSON.parse(payload.toString()) });
      } catch { /* non-JSON frame, e.g. binary */ }
    });
    ws.on('framesent', ({ payload }) => {
      try {
        frames.push({ dir: 'out', payload: JSON.parse(payload.toString()) });
      } catch { /* non-JSON frame */ }
    });
  });
  return frames;
}
