---
tags:
  - frontend
---

# Toast Notifications

When an operator submits a checklist, admins see a slide-in toast notification on the AdminDashboard. This gives admins immediate awareness of new work requiring their review.

## How It Works

The toast lifecycle is driven entirely by WebSocket events:

1. An operator calls `POST /:id/submit`. The backend's submit handler (after the successful `conditionalStatusTransition`) broadcasts a `new_submission` message to all dashboard subscribers via `broadcastToDashboard`:

```typescript
bc.broadcastToDashboard({
  type: 'new_submission',
  checklistId: checklist.id,
  lineName: checklist.lineName,
  operatorName: checklist.operatorName,
  submittedAt: now,
});
```

2. The AdminDashboard component subscribes to the [[WebSocket System]] dashboard channel via `wsClient.subscribeDashboard()`. When a `new_submission` event arrives, the `useToasts` hook adds a toast to its state array.

3. The toast renders as a card sliding in from the top-right corner, showing: "New submission from **[operator name]** for **[line name]**". It includes a "Review" action link that navigates to `/checklist/:id/review`.

4. Each toast auto-dismisses after 5 seconds. A close button allows manual dismissal. Toasts stack vertically if multiple submissions arrive in quick succession.

## Dashboard Refresh

In addition to the toast, the `new_submission` event triggers a data refresh on the AdminDashboard. The Pending tab's checklist list re-fetches to include the newly submitted checklist. This way the admin can see both the toast notification and the new row in the table.

Similarly, `dashboard_refresh` events (sent when a checklist is approved or denied) trigger a re-fetch so the checklist moves to the correct tab without manual reload.

## Notification Bell

The admin dashboard has a notification bell icon that shows unviewed submitted and in-progress checklists.

**Backend:** `GET /checklists/notifications` returns paginated checklists with `{ items, total, unviewedCount, hasMore }`. The `viewedAt` and `viewedBy` fields on each checklist track whether an admin has seen it.

**Mark as viewed:** Checklists are auto-marked as viewed when an admin opens them (`GET /checklists/:id` sets `viewedAt` via atomic `markChecklistViewed()` UpdateCommand). Bulk marking uses `POST /mark-all-viewed` which processes up to 500 checklists in batches of 25.

**New activity resets viewed status:** When an operator adds a comment or image, `viewedAt` is reset to `null` so the admin sees it as new activity again.

**Frontend:** The dropdown shows 20 notifications per page with a "Load more" button. Each row shows line name, operator, status badge, latest activity, and "New"/"Viewed" indicator. Clicking navigates to the review page.

## Relationship to Toasts

Toasts are ephemeral (5 seconds). The notification bell is persistent (until the admin views the checklists). They complement each other: toasts catch your attention in the moment, the bell catches up if you missed the toast.

## See also

- [[WebSocket System]] -- the `new_submission` event that drives toasts
- [[Frontend Pages]] -- AdminDashboard where toasts render
- [[Checklist Workflow]] -- submission is the trigger event
