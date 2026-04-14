---
tags: [decision]
created: 2026-04-10
updated: 2026-04-13
---

# WebSocket Adapter Pattern

The production target for WebSocket is AWS API Gateway WebSocket API. But API Gateway WebSocket does not work with LocalStack (the local AWS emulator). The solution is a strategy pattern that lets the frontend work identically in both environments while the backend swaps implementations.

## The Interface

`backend/src/ws/broadcaster.ts` defines the `WebSocketBroadcaster` interface with five methods: `init`, `broadcastToChecklist`, `broadcastPresence`, `broadcastPresenceSummary`, `broadcastToDashboard`, and `getChecklistPresence`. Every route handler calls these methods without knowing which implementation is running.

## Two Implementations

**`LocalWsBroadcaster`** (`ws/local-ws.ts`): Creates a `ws` WebSocketServer on the same HTTP server that Express uses. Connections are tracked in an in-memory `Map<string, LocalConnection>` and also persisted to the Connections table in [[DynamoDB Tables]] for consistency. Handles the full message protocol.

**`ApiGatewayBroadcaster`** (`ws/apigw-ws.ts`): Posts messages to the API Gateway Management API endpoint (`APIGW_WS_ENDPOINT`). Connections are tracked only in DynamoDB. Connection setup and message routing happen in Lambda functions attached to API Gateway routes.

## Selection

`createBroadcaster(mode)` uses dynamic imports. The `mode` comes from `config.wsMode`, which reads the `WS_MODE` [[Environment Variables]] (default: `'local'`).

## Frontend Transparency

The frontend's `WebSocketClient` connects to a URL from `VITE_WS_URL`. In production this would point to the API Gateway WebSocket URL. The message protocol is identical -- same JSON format, same event types, same subscribe/unsubscribe/heartbeat flow. The frontend does not know or care which backend implementation it is talking to.

## Why Not Just Use `ws` in Production?

The `ws` library runs on a single Node.js process. If the backend scales to multiple instances behind a load balancer, WebSocket connections are distributed across instances. An operator connected to instance A would not receive broadcasts from a route handler running on instance B.

API Gateway WebSocket solves this because it is a managed service that routes all connections through a single control plane. Any Lambda or service with the right credentials can post to any connection.

The in-memory `Map` in `LocalWsBroadcaster` has the same limitation -- it only knows about connections on its own process. This is fine for single-process development. See [[Known Limitations]] for the single-process WebSocket limitation.

## See also

- [[WebSocket System]] -- the system using this pattern
- [[Environment Variables]] -- WS_MODE and related config
- [[Known Limitations]] -- single-process WebSocket constraint
