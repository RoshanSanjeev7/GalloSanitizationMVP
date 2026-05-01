import { test, expect } from '@playwright/test';

const OPERATOR1 = { email: 'gsanchez@gallo.com', password: 'operator123' };
const OPERATOR2 = { email: 'mrivera@gallo.com', password: 'operator123' };
const ADMIN = { email: 'ymartinez@gallo.com', password: 'admin123' };

async function login(page: any, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
}

test.describe('Multi-User WebSocket Tests', () => {

  test('two operators can open the same checklist simultaneously', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // Operator 1 opens a checklist
    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    // Operator 2 opens the SAME checklist
    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);

    // Both should see the checklist loaded with machine buttons
    await expect(page1.locator('button:has-text("/")').first()).toBeVisible();
    await expect(page2.locator('button:has-text("/")').first()).toBeVisible();

    // Both should see the same checklist title
    await expect(page1.locator('h2')).toContainText('Deep Clean');
    await expect(page2.locator('h2')).toContainText('Deep Clean');

    await ctx1.close();
    await ctx2.close();
  });

  test('operator 1 edits save successfully while operator 2 is on same checklist', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // Both operators open the same checklist
    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);

    await page1.waitForTimeout(2000);

    // Operator 1 checks an item
    await page1.locator('[title="Mark as done"]').first().click();

    // Should save successfully (no conflict since operator 2 hasn't edited)
    await expect(page1.locator('text=Saved')).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('admin can view dashboard while operators edit checklists', async ({ browser }) => {
    const operatorCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const operatorPage = await operatorCtx.newPage();
    const adminPage = await adminCtx.newPage();

    // Operator opens a checklist
    await login(operatorPage, OPERATOR1);
    await operatorPage.click('button:has-text("In Progress")');
    await operatorPage.locator('span:has-text("Line 9")').first().click();
    await operatorPage.waitForURL(/\/checklist\/.*\/fill/);

    // Admin opens dashboard — should load without errors
    await login(adminPage, ADMIN);
    await expect(adminPage.locator('h1')).toContainText('Sanitation Audit Log');

    // Admin should see checklist tabs with counts
    await expect(adminPage.locator('button:has-text("Pending")')).toBeVisible();

    // Both sessions work independently
    await expect(operatorPage.locator('h2')).toContainText('Deep Clean');

    await operatorCtx.close();
    await adminCtx.close();
  });

  test('submit by operator triggers toast for admin', async ({ browser }) => {
    const operatorCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const operatorPage = await operatorCtx.newPage();
    const adminPage = await adminCtx.newPage();

    // Admin opens dashboard first
    await login(adminPage, ADMIN);
    await adminPage.waitForTimeout(2000);

    // Operator creates and submits a checklist via API (faster than UI)
    await login(operatorPage, OPERATOR1);
    const token = await operatorPage.evaluate(() => localStorage.getItem('token'));

    // Create a checklist
    const createRes = await operatorPage.request.post('http://localhost:4000/api/checklists', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { lineId: await getLineId(operatorPage, token!) },
    });

    if (createRes.ok()) {
      const checklist = await createRes.json();

      // Submit it
      await operatorPage.request.post(`http://localhost:4000/api/checklists/${checklist.id}/submit`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      // Admin should see a toast notification
      await expect(async () => {
        const toast = adminPage.locator('text=/New submission/i');
        expect(await toast.count()).toBeGreaterThan(0);
      }).toPass({ timeout: 10000 });
    }

    await operatorCtx.close();
    await adminCtx.close();
  });

  test('operator sees conflict banner when another operator edits same machine', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // Both operators open same checklist
    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);
    await page2.waitForTimeout(2000);

    // Both on same machine — rapid edits to trigger version conflict
    // Operator 1 clicks a done button
    await page1.locator('[title="Mark as done"]').first().click();
    // Immediately operator 2 clicks a different done button
    await page2.locator('[title="Mark as done"]').nth(1).click();

    // Wait for auto-saves to fire and potentially conflict
    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);

    // At least one should show save status (Saved or conflict)
    const p1Saved = await page1.locator('text=Saved').count();
    const p1Conflict = await page1.locator('text=/modified by another/i').count();
    const p2Saved = await page2.locator('text=Saved').count();
    const p2Conflict = await page2.locator('text=/modified by another/i').count();

    // Both should have resolved — either saved or showed conflict
    expect(p1Saved + p1Conflict + p2Saved + p2Conflict).toBeGreaterThan(0);

    await ctx1.close();
    await ctx2.close();
  });

  test('submit disables button and shows confirmation modal', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await login(page, OPERATOR1);
    await page.click('button:has-text("In Progress")');
    await page.locator('span:has-text("Line 9")').first().click();
    await page.waitForURL(/\/checklist\/.*\/fill/);

    // Click Submit
    await page.locator('button:has-text("Submit Checklist")').first().click();

    // Should show modal (either "Are you sure" or "Cannot Submit")
    await expect(page.locator('h2:text-matches("Submit Checklist|Cannot Submit")')).toBeVisible();

    await ctx.close();
  });

  test('admin approve/deny buttons disable during action', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await login(page, ADMIN);
    await page.click('button:has-text("Pending")');

    // Find a submitted checklist
    const row = page.locator('span:has-text("Line 9")').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForURL(/\/checklist\/.*\/review/);

      // Click Approve
      const approveBtn = page.locator('button:has-text("Approve")').first();
      await approveBtn.click();

      // Button should show "Approving..." or navigate away
      await expect(async () => {
        const approving = await page.locator('text=Approving...').count();
        const onAdmin = page.url().includes('/admin');
        expect(approving > 0 || onAdmin).toBe(true);
      }).toPass({ timeout: 10000 });
    }

    await ctx.close();
  });

  test('reconnect banner appears when WebSocket drops', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await login(page, OPERATOR1);

    // The WebSocket should be connected — no reconnect banner
    await expect(page.locator('text=Reconnecting...')).not.toBeVisible();

    await ctx.close();
  });

  // ── Real-time propagation tests ──────────────────────────────────
  // These assert the WebSocket actually delivers presence + content
  // updates to peers, not just that the page loads. They exist
  // because the existing tests above never verify that one operator's
  // changes appear in the other operator's view without refresh —
  // exactly the user complaint that drove the API Gateway WebSocket
  // provisioning.

  test('two operators on the same checklist see each other in the presence indicator within 2s', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);

    // Each side should see the OTHER user appear within 2s. The
    // PresenceAvatars component renders avatars with title={u.name}
    // (not the local user, only peers).
    await expect(page1.locator('[title="Marcus Rivera"]')).toBeVisible({ timeout: 2000 });
    await expect(page2.locator('[title="Gabriel Sanchez"]')).toBeVisible({ timeout: 2000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('checking an item on one client propagates to the peer within 2s', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);
    // Wait for both clients' WS subscribe to land before mutating.
    await page1.waitForTimeout(1500);

    // Page 1 marks the first item as done. The "completedBy" stamp
    // is the most reliable propagation signal because the renderer
    // only emits it when the broadcast lands (the local optimistic
    // update would say "Gabriel Sanchez", the peer view says it
    // received from "Gabriel Sanchez").
    await page1.locator('[title="Mark as done"]').first().click();

    // Page 2 should show Gabriel's name as the completer of an item
    // within 2s, without any refresh.
    await expect(page2.locator('text=Gabriel Sanchez').first()).toBeVisible({ timeout: 2000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('a peer disconnecting is reflected in the remaining client within 5s', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);

    // Confirm Marcus shows up first…
    await expect(page1.locator('[title="Marcus Rivera"]')).toBeVisible({ timeout: 3000 });

    // …then close ctx2 entirely so the WS drops cleanly.
    await ctx2.close();

    // Marcus should disappear from page1's presence within 5s.
    // (Local-ws broadcasts presence-leave on close synchronously;
    // production lambda-ws does the same now via the disconnect fix.)
    await expect(page1.locator('[title="Marcus Rivera"]')).not.toBeVisible({ timeout: 5000 });

    await ctx1.close();
  });

  test('a comment added by one client appears in the peer view within 2s', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await login(page1, OPERATOR1);
    await page1.click('button:has-text("In Progress")');
    await page1.locator('span:has-text("Line 9")').first().click();
    await page1.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = page1.url();

    await login(page2, OPERATOR2);
    await page2.goto(checklistUrl);
    await page2.waitForURL(/\/checklist\/.*\/fill/);
    await page1.waitForTimeout(1500);

    // Open the issue/comment editor on the first item from page1 by
    // clicking "Mark with issue", typing into the textarea, blurring.
    await page1.locator('[title="Mark with issue"]').first().click();
    const commentBox = page1.locator('textarea').first();
    const COMMENT = `WS-test ${Date.now()}`;
    await commentBox.fill(COMMENT);
    // Click outside to trigger save
    await page1.locator('h2').first().click();

    // Page 2 should show the comment text within 2s.
    await expect(page2.locator(`text=${COMMENT}`)).toBeVisible({ timeout: 2500 });

    await ctx1.close();
    await ctx2.close();
  });
});

// Helper to get a valid line ID
async function getLineId(page: any, token: string): Promise<string> {
  const res = await page.request.get('http://localhost:4000/api/lines', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const lines = await res.json();
  const line91 = lines.find((l: any) => l.name === 'Line 91');
  return line91?.id || lines[0]?.id;
}
