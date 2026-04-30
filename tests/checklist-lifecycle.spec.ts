import { test, expect } from '@playwright/test';
import { ADMIN, OPERATOR, login, captureWsFrames } from './helpers';

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

  /**
   * End-to-end verification that the WebSocket fan-out works for the two
   * key cross-user notifications:
   *   - Operator submit → admin's dashboard receives `new_submission`.
   *   - Admin approve   → operator's open page receives `status_change`.
   *
   * Both contexts run concurrently so the WS frame capture is purely
   * passive — we don't need to refresh either page to see the events.
   * This is the integration test that the unit + integration tests in
   * backend/src/ws/__tests__/ can't cover (they don't exercise the
   * frontend client or the full HTTP-to-WebSocket fan-out path).
   */
  test('WebSocket events fire end-to-end on submit and approve', async ({ browser }) => {
    const operatorCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const operatorPage = await operatorCtx.newPage();
    const adminPage = await adminCtx.newPage();

    // Attach frame capture BEFORE login — the WebSocket connects right
    // after login completes, and we need the listener in place before
    // the upgrade handshake to catch the `connected` frame and
    // anything that fires before our first assertion.
    const operatorFrames = captureWsFrames(operatorPage);
    const adminFrames = captureWsFrames(adminPage);

    await login(operatorPage, OPERATOR);
    await login(adminPage, ADMIN);

    // Admin lands on /admin and subscribes to the dashboard channel as
    // part of the page mount. Wait for the `connected` frame so we know
    // the socket is up before triggering the cross-context event.
    await expect.poll(
      () => adminFrames.some((f) => f.dir === 'in' && f.payload.type === 'connected'),
      { timeout: 5000 },
    ).toBe(true);

    // Operator creates a fresh checklist and submits it via the API
    // (matching the existing test's pattern — bypasses the
    // completeness check that the UI enforces).
    await operatorPage.click('button:has-text("Add Checklist")');
    await operatorPage.locator('select.form-select').last().selectOption({ label: 'Line 91' });
    await operatorPage.locator('button:has-text("Create")').click();
    await operatorPage.waitForTimeout(500);
    await operatorPage.click('button:has-text("In Progress")');
    await operatorPage.locator('text=Line').first().click();
    await operatorPage.waitForURL(/\/checklist\/.*\/fill/);
    const checklistUrl = operatorPage.url();
    const checklistId = checklistUrl.match(/\/checklist\/([^/]+)\//)?.[1];
    expect(checklistId).toBeTruthy();

    const operatorToken = await operatorPage.evaluate(() => localStorage.getItem('token'));
    await operatorPage.request.post(
      `http://localhost:4000/api/checklists/${checklistId}/submit`,
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );

    // Admin's WS should receive a `new_submission` frame referencing
    // this checklist. Polling because the frame arrives async after
    // the HTTP response.
    await expect.poll(
      () => adminFrames.find(
        (f) => f.dir === 'in'
          && f.payload.type === 'new_submission'
          && f.payload.checklistId === checklistId,
      ),
      { timeout: 5000, message: 'Admin should receive new_submission via WS after operator submits' },
    ).toBeDefined();

    // Now the admin approves the checklist (also via API — the UI
    // approval flow is covered by the workflow test above; here we
    // just need to trigger the status transition).
    const adminToken = await adminPage.evaluate(() => localStorage.getItem('token'));
    await adminPage.request.post(
      `http://localhost:4000/api/checklists/${checklistId}/approve`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    // The operator's open page should observe a `status_change` frame.
    // It's still on the /fill page so it has an active subscription
    // to this checklist's channel.
    await expect.poll(
      () => operatorFrames.find(
        (f) => f.dir === 'in'
          && f.payload.type === 'status_change'
          && f.payload.checklistId === checklistId
          && f.payload.status === 'approved',
      ),
      { timeout: 5000, message: 'Operator should receive status_change via WS after admin approves' },
    ).toBeDefined();

    await operatorCtx.close();
    await adminCtx.close();
  });
});
