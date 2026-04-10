# Real-time WebSocket, Collaborative Editing & Presence — Design Spec

## Overview

Add real-time collaborative editing to the Gallo Sanitization MVP so multiple operators can work on the same checklist simultaneously with live item updates, presence indicators, and automatic reconnection. This is Sub-project 1 of Release 2.

**What this enables:**
- Operator A checks off an item → Operator B sees it update instantly
- Admin dashboard shows who's currently editing each checklist
- ChecklistFill header shows co-editors with their active machine
- SubmissionReview sidebar shows who's viewing
- Automatic reconnect on spotty facility WiFi with state resync

**What this does NOT include (future sub-projects):**
- Admin toast notifications for new submissions (Sub-project 2)
- Offline save queue with IndexedDB (Sub-project 2)
- Audit log (Sub-project 3)

---

## Architecture

### WebSocket Strategy: API Gateway WebSocket (Production) + Adapter Pattern (Local Dev)

**Production:** AWS API Gateway WebSocket API with Lambda handlers for `$connect`, `$disconnect`, and `$default` routes. Broadcasting uses `@aws-sdk/client-apigatewaymanagementapi` to push messages to connected clients.

**Local development:** Lightweight `ws` library WebSocket server attached to the existing Express HTTP server on port 4000 at path `/ws`. In-memory connection tracking. Same message protocol as production.

**Adapter pattern:** A `WebSocketBroadcaster` interface abstracts the difference. The app selects the implementation based on `WS_MODE` env var (`local` or `apigw`). Frontend code is identical in both environments — only the WebSocket URL changes.

### Connection Lifecycle

1. Frontend connects after login via native `WebSocket` API
2. JWT token passed in query string: `ws://localhost:4000/ws?token=xxx`
3. Server validates JWT, creates connection record in DynamoDB
4. Client subscribes to specific checklists or the dashboard presence summary
5. **Idle disconnect:** After 5 minutes of no `mousemove`/`touchstart`/`keydown`, client sends `{ type: "idle" }`, closes WebSocket. Reconnects on next user interaction.
6. **Auto-reconnect on drop:** Exponential backoff (1s, 2s, 4s, 8s, max 30s). On reconnect: re-auth, re-subscribe, fetch full state via REST to catch missed updates.

---

## Message Protocol

All messages are JSON with a `type` field.

### Client → Server

| Type | Payload | When |
|------|---------|------|
| `subscribe` | `{ checklistId }` | Operator opens ChecklistFill or admin opens SubmissionReview |
| `unsubscribe` | `{ checklistId }` | User navigates away from checklist |
| `machine_change` | `{ checklistId, machineIdx }` | Operator switches active machine (for presence) |
| `subscribe_dashboard` | `{}` | Admin opens AdminDashboard |
| `unsubscribe_dashboard` | `{}` | Admin navigates away from dashboard |
| `heartbeat` | `{}` | Every 60 seconds while active |
| `idle` | `{}` | 5 min of no user activity, before disconnecting |

### Server → Client

| Type | Payload | When |
|------|---------|------|
| `item_update` | `{ checklistId, machineIdx, catIdx, itemIdx, field, value, by, at }` | Another user changed a checklist item |
| `comment_update` | `{ checklistId, machineIdx, catIdx, itemIdx, issue, by, at }` | Another user added/edited a comment |
| `image_update` | `{ checklistId, machineIdx, catIdx, itemIdx, images, by, at }` | Images added or removed |
| `status_change` | `{ checklistId, status, by, at }` | Checklist submitted, approved, or denied |
| `checklist_deleted` | `{ checklistId }` | Admin deleted the checklist |
| `presence` | `{ checklistId, users: [{ id, name, role, machine }] }` | Presence list updated for a specific checklist |
| `presence_summary` | `{ checklists: { [id]: [{ name, machine }] } }` | Dashboard-level presence (every 10s) |
| `connected` | `{ userId, connectionId }` | Connection acknowledged |
| `error` | `{ message }` | Auth failure or invalid message |

---

## DynamoDB: Connections Table

**Table name:** `SanitizationConnections`

| Field | Type | Description |
|-------|------|-------------|
| `connectionId` | String (PK) | WebSocket connection ID |
| `userId` | String | Authenticated user ID |
| `userName` | String | Display name for presence |
| `userRole` | String | `operator` or `admin` |
| `checklistId` | String or null | Which checklist they're subscribed to (null = dashboard only) |
| `activeMachine` | Number or null | Which machine index they're on |
| `channel` | String | `dashboard` or `checklist:{id}` — for efficient querying |
| `connectedAt` | String | ISO timestamp |
| `lastActivity` | String | ISO timestamp — updated on heartbeat |
| `ttl` | Number | Epoch seconds for DynamoDB TTL auto-cleanup (30 min from lastActivity) |

**GSIs:**
- `checklistId-index` (PK: `checklistId`) — find all users viewing a specific checklist
- `channel-index` (PK: `channel`) — find all dashboard subscribers

---

## Backend Implementation

### New Files

#### `backend/src/ws/messages.ts`
Type definitions for all WebSocket messages. Shared between server-side handlers and can be imported by frontend for type safety.

```typescript
interface ItemUpdateMessage {
  type: 'item_update';
  checklistId: string;
  machineIdx: number;
  catIdx: number;
  itemIdx: number;
  field: 'completed' | 'completedBy' | 'completedAt';
  value: boolean | string | null;
  by: string;
  at: string;
}
// ... etc for all message types
```

#### `backend/src/ws/broadcaster.ts`
```typescript
interface WebSocketBroadcaster {
  broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void>;
  broadcastPresenceSummary(): Promise<void>;
  broadcastPresence(checklistId: string): Promise<void>;
  getChecklistPresence(checklistId: string): Promise<PresenceUser[]>;
  init(server?: HttpServer): void;
}

function createBroadcaster(): WebSocketBroadcaster;  // factory, reads WS_MODE env
```

#### `backend/src/ws/local-ws.ts`
- `LocalWsBroadcaster` class implementing the interface
- Attaches `ws.WebSocketServer` to the Express HTTP server at path `/ws`
- Validates JWT from query string on `connection` event
- In-memory `Map<string, { ws, userId, userName, userRole, checklistId, activeMachine }>` for connections
- Handles incoming messages: `subscribe`, `unsubscribe`, `machine_change`, `subscribe_dashboard`, `heartbeat`, `idle`
- On `subscribe`: add to in-memory map, store connection in DynamoDB (for cross-reference), broadcast presence
- On `close`: remove from map, delete from DynamoDB, broadcast presence
- Broadcasting: iterate in-memory map, send to matching connections

#### `backend/src/ws/apigw-ws.ts`
- `ApiGatewayBroadcaster` class implementing the interface
- Uses `ApiGatewayManagementApiClient` from `@aws-sdk/client-apigatewaymanagementapi`
- Broadcasting: query DynamoDB connections table by `checklistId-index`, `postToConnection` for each
- Handles `GoneException` by deleting stale connection records
- `init()` is a no-op (API Gateway manages the WebSocket server)

#### `backend/src/data/connections.ts`
DynamoDB operations for the connections table:
- `putConnection(conn)` — store a new connection
- `deleteConnection(connectionId)` — remove on disconnect
- `updateConnectionChecklist(connectionId, checklistId, activeMachine)` — on subscribe/machine_change
- `getConnectionsByChecklist(checklistId)` — query GSI for presence/broadcasting
- `getConnectionsByChannel(channel)` — query GSI for dashboard subscribers
- `getAllActiveConnections()` — for presence summary

### Modified Files

#### `backend/src/index.ts`
- Import and initialize the broadcaster: `const broadcaster = createBroadcaster(); broadcaster.init(server);`
- Store `broadcaster` in app context so routes can access it: `app.set('broadcaster', broadcaster)`
- Pass the HTTP server (from `app.listen()`) to `broadcaster.init()`

#### `backend/src/routes/checklists.ts`
After each successful mutation, broadcast:

| Endpoint | Broadcast |
|----------|-----------|
| `PUT /:id/machines/:machineIdx` | Diff old vs new machine items, send `item_update` for each changed item + `comment_update` for changed comments |
| `PUT /:id/items` | Same diffing logic, broadcast all changes |
| `POST /:id/submit` | `status_change` with `status: 'submitted'` |
| `POST /:id/approve` | `status_change` with `status: 'approved'` |
| `POST /:id/deny` | `status_change` with `status: 'denied'` |
| `DELETE /:id` | `checklist_deleted` |
| `POST /mark-all-viewed` | No broadcast needed (admin-only UI state) |

The broadcaster is accessed via `req.app.get('broadcaster')`. To prevent echo (the client that made the change receiving its own update), broadcasts include `excludeUserId` rather than `excludeConnectionId` — the REST request carries `req.userId` from JWT auth, and the broadcaster skips connections belonging to that user. This means a user with multiple tabs will only receive the echo in tabs that didn't make the change, which is acceptable (those tabs need the update).

#### `backend/src/routes/images.ts`
After image upload/delete, broadcast `image_update` with the new images array for that item.

#### `backend/src/config/env.ts`
Add:
- `wsMode`: `process.env.WS_MODE || 'local'`
- `apiGatewayEndpoint`: `process.env.APIGW_WS_ENDPOINT || undefined`

#### `localstack/init-aws.sh`
Add `SanitizationConnections` table creation with TTL enabled and GSIs.

---

## Frontend Implementation

### New Files

#### `frontend/src/services/websocket.ts`
WebSocket client manager — singleton class:

```typescript
class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private idleTimer: number | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private subscriptions: Set<string> = new Set(); // for re-subscribe on reconnect
  
  connect(token: string): void;        // Open WebSocket, authenticate
  disconnect(): void;                   // Clean close
  subscribe(checklistId: string): void; // Join a checklist room
  unsubscribe(checklistId: string): void;
  subscribeDashboard(): void;
  unsubscribeDashboard(): void;
  machineChange(checklistId: string, machineIdx: number): void;
  
  on(type: string, handler: Function): () => void;  // Returns unsubscribe fn
  
  private handleMessage(event: MessageEvent): void;
  private handleClose(): void;
  private attemptReconnect(): void;
  private resetIdleTimer(): void;
  private onIdle(): void;
  private resync(): void;              // Fetch full state after reconnect
}

export const wsClient = new WebSocketClient(); // singleton
```

**Idle detection:** Listens to `mousemove`, `touchstart`, `keydown` on `window`. Resets a 5-minute timer on each event. On timeout, sends `idle` message and disconnects. On next user interaction, reconnects.

**Reconnect:** Exponential backoff with jitter. On reconnect, re-subscribes to all active subscriptions and calls `resync()` which fetches the latest checklist state via REST.

#### `frontend/src/hooks/useWebSocket.ts`
```typescript
function useWebSocket() {
  // Manages connection lifecycle tied to auth state
  // Connects on login, disconnects on logout
  // Returns { connected, reconnecting }
}
```

#### `frontend/src/hooks/useChecklistSync.ts`
```typescript
function useChecklistSync(checklistId: string, machines: ChecklistMachine[], setMachines: Function) {
  // Subscribes to checklistId on mount, unsubscribes on unmount
  // Listens for item_update, comment_update, image_update, status_change, checklist_deleted
  // Applies deltas to local machines state
  // Returns { presence: PresenceUser[], isDeleted: boolean, statusChanged: string | null }
}
```

This hook is the core of real-time editing. When it receives an `item_update`:
1. Check if the local user is currently editing that exact item (e.g., typing a comment)
2. If not, apply the delta immediately: `setMachines(prev => updateMachineItem(prev, ...))`
3. If yes, queue the delta and show a subtle "updated by [name]" indicator on that item

#### `frontend/src/hooks/usePresenceSummary.ts`
```typescript
function usePresenceSummary() {
  // Subscribes to dashboard presence on mount
  // Returns { presenceMap: Record<checklistId, PresenceUser[]> }
}
```

#### `frontend/src/components/PresenceAvatars.tsx`
Renders overlapping circular avatars with initials. Props: `users: { name: string }[]`, optional `max` (default 3, shows "+N" for overflow).

#### `frontend/src/components/ReconnectBanner.tsx`
Slim banner below the header: "Reconnecting..." with a subtle pulse animation. Only visible during reconnection attempts.

### Modified Files

#### `frontend/src/App.tsx`
- Import `useWebSocket` hook
- Call it at the top level inside `<BrowserRouter>` to manage connection lifecycle
- Connect on auth state change (user logged in), disconnect on logout

#### `frontend/src/pages/ChecklistFill.tsx`
- Use `useChecklistSync(id, machines, setMachines)` hook
- Render `<PresenceAvatars>` in the header bar next to the save status
- Show "Also editing: [names]" text
- Send `machineChange` on `activeMachine` change
- On `status_change` (another user submitted), show "This checklist was submitted by [name]" banner, disable editing
- On `checklist_deleted`, show deleted banner + redirect

#### `frontend/src/pages/SubmissionReview.tsx`
- Use `useChecklistSync(id, machines, setMachines)` hook
- Render `<PresenceAvatars>` in the summary sidebar under "Currently Viewing"
- On `status_change` (another admin approved/denied), show banner + redirect
- On `checklist_deleted`, show deleted banner + redirect

#### `frontend/src/pages/AdminDashboard.tsx`
- Use `usePresenceSummary()` hook
- Render `<PresenceAvatars>` on each checklist row that has active editors
- On `status_change` events from the presence summary channel, refetch counts (lightweight polling already exists from R1, this supplements it)

---

## Configuration

### Environment Variables

| Variable | Local Default | Production |
|----------|--------------|------------|
| `WS_MODE` | `local` | `apigw` |
| `APIGW_WS_ENDPOINT` | — | `https://xxx.execute-api.us-west-2.amazonaws.com/prod` |
| `VITE_WS_URL` | `ws://localhost:4000/ws` | `wss://xxx.execute-api.us-west-2.amazonaws.com/prod` |

### DynamoDB Table: SanitizationConnections

```
PK: connectionId (String)
GSI checklistId-index: checklistId (String)
GSI channel-index: channel (String)
TTL attribute: ttl
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| JWT expired on connect | Server returns `{ type: "error", message: "Token expired" }`, client refreshes token via REST then reconnects |
| JWT expired mid-session | API Gateway closes connection (10 min idle timeout), client detects close and reconnects with fresh token |
| Delta for item user is editing | Queue delta, show "updated by [name]" indicator, apply when user stops editing |
| Network drop | Auto-reconnect with backoff, "Reconnecting..." banner, full state resync on reconnect |
| Stale connection (GoneException) | Delete connection record, skip — don't fail the broadcast |
| Broadcast partially fails | Log warning, continue — one failed connection shouldn't block others |
| WebSocket not supported (old browser) | Fall back to 30s polling (already exists from R1) |

---

## Testing Strategy

### Unit Tests (Vitest)
- `broadcaster.test.ts`: Mock DynamoDB, verify `broadcastToChecklist` queries correct GSI and sends to all connections
- `local-ws.test.ts`: Verify JWT validation on connect, subscribe/unsubscribe message handling, presence tracking
- `connections.test.ts`: CRUD operations on connections table
- `websocket.test.ts` (frontend): Mock WebSocket, verify connect/reconnect/idle/subscribe lifecycle
- `useChecklistSync.test.ts`: Verify delta application, conflict detection, presence extraction

### E2E Tests (Playwright)
- **Presence on dashboard:** Login as operator, open checklist → login as admin in another context, verify avatar appears on dashboard row
- **Real-time item update:** Two browser contexts, both on same checklist → check item in context A, verify it appears checked in context B
- **Status change notification:** Operator submits → admin on review page sees status change banner
- **Reconnection:** Simulate network drop by intercepting WebSocket, verify "Reconnecting..." banner appears and disappears on recovery

### Manual Testing
- Open checklist on two devices simultaneously, check items back and forth
- Kill backend, verify reconnect behavior
- Leave page idle for 5+ minutes, verify disconnect and reconnect on mouse move

---

## Dependencies

### Backend (new)
- `ws` + `@types/ws` — Local WebSocket server
- `@aws-sdk/client-apigatewaymanagementapi` — Production broadcast to API Gateway connections

### Frontend (none)
- Uses native `WebSocket` API — no library needed

---

## Out of Scope

- **Message persistence/replay:** If a client is offline, they miss messages. Reconnect resync via REST covers this.
- **Typing indicators:** Not needed for checkbox-based forms.
- **Cursor sharing:** Operators don't need to see each other's cursor position.
- **End-to-end encryption:** Internal facility network, not needed.
- **Rate limiting WebSocket messages:** Item deltas are inherently bounded by user interaction speed.
