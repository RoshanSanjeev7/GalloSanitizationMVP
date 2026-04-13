---
tags:
  - architecture
  - backend
  - frontend
---

# WebSocket System

The WebSocket layer enables real-time sync between operators editing the same checklist, presence indicators on dashboards, and toast notifications for admins.

## Adapter Pattern

The backend defines a `WebSocketBroadcaster` interface in `backend/src/ws/broadcaster.ts`:

```typescript
export interface WebSocketBroadcaster {
  init(server?: HttpServer): void;
  broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void>;
  broadcastPresence(checklistId: string): Promise<void>;
  broadcastPresenceSummary(): Promise<void>;
  broadcastToDashboard(message: object): Promise<void>;
  getChecklistPresence(checklistId: string): Promise<PresenceUser[]>;
}
```

Two implementations exist:
- **`LocalWsBroadcaster`** -- Uses the `ws` npm package to run a WebSocket server on the same HTTP server as Express. Connections are tracked in an in-memory `Map` and also persisted to DynamoDB for consistency. Used in development.
- **`ApiGatewayBroadcaster`** -- Posts messages to AWS API Gateway Management API. Connections are tracked only in DynamoDB. Used in production.

`createBroadcaster(config.wsMode)` selects the implementation based on the `WS_MODE` environment variable. See [[WebSocket Adapter Pattern]] for why this design exists.

## Connection Lifecycle

1. **Connect:** Frontend `WebSocketClient` (a singleton in `services/websocket.ts`) opens `ws://localhost:4000/ws?token=<jwt>`. Backend verifies the JWT, looks up the user, creates a `LocalConnection` record, stores it in [[DynamoDB Tables]] (`SanitizationConnections` with a 30-minute TTL), and sends back `{ type: 'connected', userId, connectionId }`.

2. **Subscribe:** When a user opens a checklist page, the frontend sends `{ type: 'subscribe', checklistId }`. The backend updates the connection's `checklistId` and broadcasts `presence` to everyone on that checklist. For the admin dashboard, `subscribe_dashboard` subscribes to `new_submission` and `dashboard_refresh` events.

3. **Heartbeat:** Every 60 seconds, the frontend sends `{ type: 'heartbeat' }`. The backend calls `touchConnection` to update `lastActivity`, which resets the TTL.

4. **Idle disconnect:** After 5 minutes of no mouse/touch/keyboard activity, the frontend sends `{ type: 'idle' }` and closes the connection. This prevents stale presence data for users who walked away from their screen.

5. **Reconnect:** When the connection closes unexpectedly (not idle), the frontend schedules a reconnect with exponential backoff: `min(1000 * 2^attempt, 30s)` plus 20% jitter. On reconnect, it re-subscribes to all active checklist and dashboard subscriptions.

## Message Types (Server to Client)

| Type | When | Data |
|------|------|------|
| `connected` | Connection established | `userId`, `connectionId` |
| `presence` | User joins/leaves/switches machine on a checklist | `checklistId`, `users[]` (each with `id`, `name`, `role`, `machine`) |
| `presence_summary` | Every 10 seconds to dashboard subscribers | `checklists` map of checklistId to users[] |
| `item_update` | Operator toggles a task | `checklistId`, indices, `completed`, `completedBy`, `completedAt` |
| `comment_update` | Operator adds/changes a comment | `checklistId`, indices, `issue` |
| `image_update` | Image uploaded or deleted | `checklistId`, indices, `images[]` |
| `status_change` | Checklist submitted/approved/denied | `checklistId`, `status`, `by`, `at` |
| `new_submission` | Operator submits a checklist | `checklistId`, `lineName`, `operatorName`, `submittedAt` |
| `dashboard_refresh` | Status changed (approve/deny) | `reason`, `checklistId`, `status` |
| `checklist_deleted` | Admin deletes a checklist | `checklistId` |

## Frontend Client

`WebSocketClient` in `services/websocket.ts` is a singleton class. It manages the raw WebSocket connection, heartbeat interval, idle detection, reconnect logic, and an event listener registry. Components subscribe to specific message types via `wsClient.on('item_update', handler)`.

The `useWebSocket` hook in `App.tsx` connects the client on login (using the stored JWT) and disconnects on logout. A `ReconnectBanner` component shows when `wsClient.reconnecting` is true.

Individual pages use `useChecklistSync` to subscribe to a specific checklist and apply incoming deltas to local state. The [[Presence Indicators]] are rendered from `presence` and `presence_summary` messages.

## Broadcasting from Route Handlers

Route handlers retrieve the broadcaster with `req.app.get('broadcaster')`. All broadcasts are fire-and-forget (`.catch(() => {})`) to avoid blocking the HTTP response. The `excludeUserId` parameter prevents the user who made the change from receiving their own broadcast back.

## See also

- [[Presence Indicators]] -- what the WebSocket presence data powers in the UI
- [[Auto-Save and Conflict Resolution]] -- how saves and WebSocket deltas interact
- [[DynamoDB Tables]] -- the Connections table tracking active WebSocket connections
