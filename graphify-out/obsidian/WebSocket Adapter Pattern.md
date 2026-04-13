---
tags:
  - decision
---

# WebSocket Adapter Pattern

The production target for WebSocket is AWS API Gateway WebSocket API. But API Gateway WebSocket doesn't work with LocalStack (the local AWS emulator). The solution is a strategy pattern that lets the frontend work identically in both environments while the backend swaps implementations.

## The Interface

`backend/src/ws/broadcaster.ts` defines the `WebSocketBroadcaster` interface:

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

Every route handler calls these methods without knowing which implementation is running.

## Two Implementations

**`LocalWsBroadcaster`** (`ws/local-ws.ts`): Creates a `ws` WebSocketServer on the same HTTP server that Express uses. Connections are tracked in an in-memory `Map<string, LocalConnection>` and also persisted to the Connections table in DynamoDB for consistency. Handles the full message protocol (subscribe, unsubscribe, heartbeat, machine_change, idle).

**`ApiGatewayBroadcaster`** (`ws/apigw-ws.ts`): Posts messages to the API Gateway Management API endpoint (`APIGW_WS_ENDPOINT`). Connections are tracked only in DynamoDB (the Connections table -- see [[DynamoDB Tables]]). Connection setup and message routing happen in Lambda functions attached to API Gateway routes.

## Selection

`createBroadcaster(mode)` in `broadcaster.ts` uses dynamic imports:

```typescript
if (mode === 'apigw') {
  const { ApiGatewayBroadcaster } = await import('./apigw-ws.js');
  return new ApiGatewayBroadcaster();
}
const { LocalWsBroadcaster } = await import('./local-ws.js');
return new LocalWsBroadcaster();
```

The `mode` comes from `config.wsMode`, which reads the `WS_MODE` environment variable (default: `'local'`). See [[Environment Variables]] for all WebSocket-related config.

## Frontend Transparency

The frontend's `WebSocketClient` in `services/websocket.ts` connects to a URL from `VITE_WS_URL` (default: `ws://localhost:4000/ws`). In production this would point to the API Gateway WebSocket URL. The message protocol is identical -- same JSON format, same event types, same subscribe/unsubscribe/heartbeat flow. The frontend doesn't know or care which backend implementation it's talking to.

## Why Not Just Use `ws` in Production?

The `ws` library runs on a single Node.js process. If the backend scales to multiple instances behind a load balancer, WebSocket connections are distributed across instances. An operator connected to instance A won't receive broadcasts from a route handler running on instance B.

API Gateway WebSocket solves this because it's a managed service that routes all connections through a single control plane. Any Lambda (or any service with the right API Gateway Management API credentials) can post to any connection.

The in-memory `Map` in `LocalWsBroadcaster` has the same limitation -- it only knows about connections on its own process. The DynamoDB Connections table is the shared state, but `LocalWsBroadcaster` currently broadcasts only to its local map. This is fine for single-process development.

## See also

- [[WebSocket System]] -- the system using this pattern
- [[Environment Variables]] -- WS_MODE and related config
