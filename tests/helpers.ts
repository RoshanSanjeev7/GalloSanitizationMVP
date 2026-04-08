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
