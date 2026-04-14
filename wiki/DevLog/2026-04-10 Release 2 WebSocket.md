---
tags: [devlog]
created: 2026-04-10
updated: 2026-04-13
---

# 2026-04-10 Release 2 WebSocket

The second release added real-time capabilities. After [[2026-04-09 Release 1 Bulletproofing]] made concurrent writes safe, this release made concurrent editing *collaborative* -- operators can see each other's changes as they happen.

## What Shipped

### WebSocket Infrastructure

The [[WebSocket System]] with adapter pattern: `WebSocketBroadcaster` interface, `LocalWsBroadcaster` for development, `ApiGatewayBroadcaster` for production. Connection lifecycle with subscribe/unsubscribe/heartbeat/idle. DynamoDB Connections table with TTL for automatic cleanup. See [[WebSocket Adapter Pattern]].

### Real-time Item Deltas

Route handlers now broadcast granular `item_update`, `comment_update`, and `image_update` messages after successful writes. The frontend's `useChecklistSync` hook applies these deltas to local state with `remoteUpdateRef` to prevent save loops. See [[Auto-Save and Conflict Resolution]].

### Presence Indicators

[[Presence Indicators]] showing who is editing which checklist. Three render locations: AdminDashboard rows, ChecklistFill header, SubmissionReview sidebar. `PresenceAvatars` component with deterministic color assignment.

### Auto-Reconnect

Exponential backoff with jitter: `min(1000 * 2^attempt, 30s)` + 20% random jitter. Re-subscribes to all active subscriptions on reconnect. `ReconnectBanner` component during reconnection.

### Toast Notifications

[[Toast Notifications]] on AdminDashboard. `new_submission` WebSocket event triggers slide-in cards. Auto-dismiss after 5 seconds.

### Offline Queue

[[Offline Queue]] using IndexedDB with 24-hour TTL. Queues saves when offline, replays on reconnect, discards stale entries. "Sync Now" button on yellow banner.

### Audit Log

[[Audit Log]] system: DynamoDB table with GSIs, fire-and-forget `logAudit()` calls, admin-only query endpoint, frontend page with color-coded action badges and date range filters.

### Template Publishing

[[Template Publishing]]: draft/published workflow for templates with visibility rules for operators vs admins.

### Idle Disconnect

After 5 minutes of no user interaction, the WebSocket client sends `idle` and closes the connection. This prevents ghost presence for inactive users.

## See also

- [[WebSocket System]] -- the core infrastructure added in this release
- [[2026-04-09 Release 1 Bulletproofing]] -- the prerequisite release
- [[2026-04-12 Code Cleanup]] -- the next session
