import { type Page, expect } from '@playwright/test';

export const ADMIN = { email: 'ymartinez@gallo.com', password: 'admin123', name: 'Y. Martinez' };
export const OPERATOR_1 = { email: 'gsanchez@gallo.com', password: 'operator123', name: 'G. Sanchez' };
export const OPERATOR_2 = { email: 'mrivera@gallo.com', password: 'operator123', name: 'M. Rivera' };

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

export async function loginAsAdmin(page: Page) {
  await login(page, ADMIN.email, ADMIN.password);
  await page.waitForURL('**/admin');
}

export async function loginAsOperator(page: Page) {
  await login(page, OPERATOR_1.email, OPERATOR_1.password);
  await page.waitForURL('/');
}

export async function logout(page: Page) {
  const logoutBtn = page.getByRole('button', { name: /log out/i });
  await logoutBtn.click();
}

/** Creates a new checklist as the logged-in operator and returns its fill URL */
export async function createChecklist(page: Page): Promise<string> {
  await page.getByRole('button', { name: /add checklist/i }).click();
  const lineSelect = page.locator('.modal-actions').locator('..').locator('select.form-select');
  // Pick first available line
  const options = await page.locator('select.form-select option').all();
  const firstRealOption = options.find(async (o) => await o.getAttribute('value') !== '');
  if (firstRealOption) {
    const val = await firstRealOption.getAttribute('value');
    if (val) await page.selectOption('select.form-select', val);
  }
  await page.getByRole('button', { name: 'Create' }).click();
  // After creation, a new checklist appears; click it to go to fill
  await page.waitForTimeout(500);
  // Return the current URL after creation redirect
  return page.url();
}
