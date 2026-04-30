---
tags: [subsystem]
created: 2026-04-10
updated: 2026-04-30
---

# WebSocket System

The WebSocket layer enables real-time sync between operators editing the same checklist, presence indicators on dashboards, and toast notifications for admins.

## Adapter Pattern

The backend defines a `WebSocketBroadcaster` interface in `backend/src/ws/broadcaster.ts`. Two implementations exist:

- **`LocalWsBroadcaster`** -- Uses the `ws` npm package to run a WebSocket server on the same HTTP server as Express. Connections are tracked in an in-memory `Map` and also persisted to DynamoDB for consistency. Used in development.
- **`ApiGatewayBroadcaster`** -- Posts messages to AWS API Gateway Management API. Connections are tracked only in DynamoDB. Used in production.

`createBroadcaster(config.wsMode)` selects the implementation based on the `WS_MODE` environment variable. See [[WebSocket Adapter Pattern]] for why this design exists.

## Connection Lifecycle

1. **Origin check (pre-auth):** `verifyClient` rejects WS upgrades from any origin not in the allowlist (defaults to `FRONTEND_ORIGIN`, optional comma list via `FRONTEND_ORIGIN_ALLOWLIST`). Browser-less clients (no `Origin` header) are allowed through and gated by JWT.

2. **Per-IP cap:** Up to 10 concurrent connections per client IP. Over-cap connections close with code 4429 + `RATE_LIMITED` error. Tracks IPs via `x-forwarded-for` first, falling back to `req.socket.remoteAddress`.

3. **Connect:** Frontend `WebSocketClient` opens `ws://localhost:4000/ws?token=<jwt>`. Backend verifies the JWT (caching `exp` for later), creates a connection record in [[DynamoDB Tables]] (`SanitizationConnections` with a 30-minute TTL), and sends back `{ type: 'connected', userId, connectionId }`.

4. **Subscribe:** When a user opens a checklist page, the frontend sends `{ type: 'subscribe', checklistId }`. The backend updates the connection's `checklistId` and broadcasts `presence` to everyone on that checklist. For the admin dashboard, `subscribe_dashboard` subscribes to `new_submission` and `dashboard_refresh` events.

5. **Heartbeat (client→server):** Every 60 seconds, the frontend sends `{ type: 'heartbeat' }`. The backend calls `touchConnection` to update `lastActivity`, which resets the TTL.

6. **Ping/pong (server→client):** Every 15 seconds, the server pings each connection. If no `pong` arrives within 30 seconds, the socket is presumed dead and `ws.terminate()` is called. This is the primary mechanism for reaping dead connections — the 30-minute DynamoDB TTL is the catastrophic-failure backstop, not the everyday cleanup. Closes the previous "ghost user" gap in [[Known Limitations]].

7. **Idle disconnect:** After 5 minutes of no mouse/touch/keyboard activity, the frontend sends `{ type: 'idle' }` and closes the connection. This prevents stale presence data for users who walked away.

8. **Reconnect:** When the connection closes unexpectedly, the frontend schedules a reconnect with exponential backoff: `min(1000 * 2^attempt, 30s)` plus 20% jitter. On reconnect, it re-subscribes to all active checklist and dashboard subscriptions. **Graceful shutdown:** if the previous close included a `server_shutdown` frame with `reconnectAfterMs`, that hint replaces the exponential delay (with jitter added) so deploys don't trigger a thundering-herd reconnect.

## Validation and Rate Limiting

Every inbound frame passes through two gates before reaching the routing switch:

1. **Schema validation** -- `backend/src/ws/validate.ts` defines a Zod discriminated union mirroring `ClientMessage`. Invalid frames return `{type:'error', code, message}` with `code` in `INVALID_JSON | INVALID_PAYLOAD | UNKNOWN_TYPE`. Three consecutive invalid frames close the connection (code 4400, `TOO_MANY_STRIKES`). Any valid frame resets the strike counter.

2. **Rate limiter** -- `backend/src/ws/limiter.ts` token-bucket per `(userId, messageType)`. Limits:

   | Type | Capacity (burst) | Refill (steady-state) |
   |---|---|---|
   | `machine_change` | 20 | 5/sec |
   | `subscribe` / `unsubscribe` | 30 | 10/min |
   | `heartbeat` / `idle` | 2 | 1/30s |
   | `subscribe_dashboard` / `unsubscribe_dashboard` | 10 | 5/min |

   Over-limit returns `{type:'error', code:'RATE_LIMITED', retryAfterMs}` with the time until the next refill. Three rate-limit hits within 60 seconds close the connection (code 4429). Buckets are keyed per-user (not per-connection) so churning sockets can't farm extra capacity.

## JWT Re-verification

The JWT `exp` is cached on the connection at handshake time. Privileged messages (`subscribe`, `unsubscribe`, `machine_change`) compare `Date.now() / 1000` against the cached `exp` before being routed; expired tokens close with code 4401 + `TOKEN_EXPIRED`. Heartbeats and idle signals are not re-checked — they're pure liveness, and forcing reauth would cause spurious disconnects right before a token refresh.

## Graceful Shutdown

`SIGTERM` invokes `LocalWsBroadcaster.shutdown()`:
1. Broadcasts `{type:'server_shutdown', reconnectAfterMs:5000}` to every open connection.
2. Closes each socket with code 1001 (`going away`).
3. Clears presence and ping intervals.
4. Closes the underlying `WebSocketServer`.

Idempotent — subsequent `shutdown()` calls are no-ops.

## Client to Server Messages

| Type | Payload | Purpose |
|------|---------|---------|
| `subscribe` | `{ checklistId }` | Join a checklist room for item deltas and presence |
| `unsubscribe` | `{ checklistId }` | Leave a checklist room |
| `machine_change` | `{ checklistId, machineIdx }` | Update which machine the user is on (for [[Presence Indicators]]) |
| `subscribe_dashboard` | `{}` | Subscribe to presence summary updates |
| `unsubscribe_dashboard` | `{}` | Unsubscribe from presence summary |
| `heartbeat` | `{}` | Keep connection alive, resets TTL |
| `idle` | `{}` | Signals inactivity, client disconnects after sending |

## Server to Client Messages

| Type | When | Data |
|------|------|------|
| `connected` | Connection established | `userId`, `connectionId` |
| `presence` | User joins/leaves/switches machine | `checklistId`, `users[]` |
| `presence_summary` | Every 10 seconds to dashboard subscribers | `checklists` map of checklistId to users[] |
| `item_update` | Operator toggles a task | `checklistId`, indices, `completed`, `completedBy` |
| `comment_update` | Operator adds/changes a comment | `checklistId`, indices, `issue` |
| `image_update` | Image uploaded or deleted | `checklistId`, indices, `images[]` |
| `status_change` | Checklist submitted/approved/denied | `checklistId`, `status`, `by`, `at` |
| `new_submission` | Operator submits a checklist | `checklistId`, `lineName`, `operatorName` |
| `dashboard_refresh` | Status changed (approve/deny) | `reason`, `checklistId`, `status` |
| `checklist_deleted` | Admin deletes a checklist | `checklistId` |
| `error` | Validation failed, rate limited, or token expired | `message`, optional `code` and `retryAfterMs` |
| `server_shutdown` | Server is restarting (SIGTERM received) | `reconnectAfterMs` (client honors as next reconnect delay) |

## Frontend Client

`WebSocketClient` in `services/websocket.ts` is a singleton class managing the raw WebSocket connection, heartbeat interval, idle detection, reconnect logic, and an event listener registry. Components subscribe to specific message types via `wsClient.on('item_update', handler)`.

The `useWebSocket` hook in `App.tsx` connects the client on login and disconnects on logout. A `ReconnectBanner` component shows when reconnecting. Individual pages use `useChecklistSync` to subscribe to a specific checklist and apply incoming deltas. The [[Presence Indicators]] are rendered from `presence` and `presence_summary` messages.

## Broadcasting from Route Handlers

Route handlers retrieve the broadcaster with `req.app.get('broadcaster')`. All broadcasts are fire-and-forget (`.catch(() => {})`) to avoid blocking the HTTP response. The `excludeUserId` parameter prevents the user who made the change from receiving their own broadcast back.

## Frontend Dev Tool

`WsDebugPanel` (`frontend/src/components/WsDebugPanel.tsx`) is a floating dev panel that taps `wsClient.onFrame` and shows every WebSocket frame in either direction with timestamp, type, and an expandable JSON body. Toggle with `Cmd+Shift+W` or visit any page with `?debug=ws`. State persists via `localStorage`. Useful for verifying the validation, rate-limiter, and shutdown behavior live in the browser.

## See also

- [[Presence Indicators]] -- what the WebSocket presence data powers in the UI
- [[Auto-Save and Conflict Resolution]] -- how saves and WebSocket deltas interact
- [[DynamoDB Tables]] -- the Connections table tracking active WebSocket connections
- [[Frontend Hooks]] -- `useWebSocket`, `useChecklistSync`, `usePresenceSummary` hooks
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- devlog entry for the validation, rate limiter, ping/pong, and graceful shutdown additions
