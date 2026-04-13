---
tags:
  - release
---

# Release 2 Real-time

The second release added real-time capabilities to the application. After [[Release 1 Bulletproofing]] made concurrent writes safe, this release made concurrent editing *collaborative* -- operators can see each other's changes as they happen.

## What Shipped

### WebSocket Infrastructure

The [[WebSocket System]] with adapter pattern: `WebSocketBroadcaster` interface, `LocalWsBroadcaster` for development, `ApiGatewayBroadcaster` for production. Connection lifecycle with subscribe/unsubscribe/heartbeat/idle. DynamoDB Connections table with TTL for automatic cleanup. See [[WebSocket Adapter Pattern]] for the design decision.

### Real-time Item Deltas

Route handlers now broadcast granular `item_update`, `comment_update`, and `image_update` messages after successful writes. The frontend's `useChecklistSync` hook applies these deltas to local state via `setMachinesRemote`, with the `remoteUpdateRef` flag preventing auto-save loops. See [[Auto-Save and Conflict Resolution]] for the full interaction.

### Presence Indicators

[[Presence Indicators]] showing who's editing which checklist. Three render locations: AdminDashboard rows (via `presence_summary` every 10s), ChecklistFill header (via `presence` on subscribe/change), SubmissionReview sidebar. `PresenceAvatars` component with deterministic color assignment.

### Auto-Reconnect

Exponential backoff with jitter: `min(1000 * 2^attempt, 30s)` + 20% random jitter. Re-subscribes to all active checklist and dashboard subscriptions on reconnect. `ReconnectBanner` component shows during reconnection attempts.

### Toast Notifications

[[Toast Notifications]] on AdminDashboard. `new_submission` WebSocket event triggers slide-in cards with operator name, line name, and "Review" action link. Auto-dismiss after 5 seconds.

### Offline Queue

[[Offline Queue]] using IndexedDB with 24-hour TTL. Queues saves when `navigator.onLine === false` and there's no HTTP status code. Replays on `online` event, discards stale entries (409/400/404). "Sync Now" button on yellow banner.

### Audit Log

[[Audit Log]] system: `SanitizationAuditLog` DynamoDB table with userId-index and timestamp-index GSIs. Fire-and-forget `logAudit()` calls in all route handlers. `GET /api/audit` endpoint with filtering. Frontend AuditLog page with color-coded action badges and date range filters.

### Idle Disconnect

After 5 minutes of no user interaction (mousemove/touchstart/keydown), the WebSocket client sends `idle` and closes the connection. This prevents ghost presence for users who walked away. Activity resumes the connection automatically.

## See also

- [[WebSocket System]] -- the core infrastructure added in this release
- [[Release 1 Bulletproofing]] -- the prerequisite release
- [[Presence Indicators]] -- the most visible UX improvement
