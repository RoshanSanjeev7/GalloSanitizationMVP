---
tags: [decision]
created: 2026-04-09
updated: 2026-04-13
---

# Known Limitations

All MVP shortcuts and known issues that should be addressed before production deployment.

## Plaintext Passwords

User passwords are stored in DynamoDB without hashing. The [[Authentication]] system compares plaintext values directly. Before production, all password storage must migrate to bcrypt or argon2 with proper salt rounds.

## In-Memory Rate Limiter

The [[Rate Limiting]] middleware uses `express-rate-limit` with its default in-memory store. This works for a single-process dev server but breaks with multiple processes -- each instance maintains its own counter. Production must switch to a Redis-backed store.

## localStorage Token Storage

The [[JWT Design]] stores the access token in `localStorage`, which is accessible to any JavaScript running on the page. An XSS vulnerability would allow token theft. Production should consider `httpOnly` cookies.

## Missing Input Validation

Several fields lack validation: template structure (no schema validation on the `machines` array shape), email format (no regex check), and password complexity (no minimum length). See [[Input Validation]] for what IS validated.

## Admin Delete Race Condition

Two admins could theoretically delete each other simultaneously. Both `getAllUsers` queries return 2 admins, both pass the check, both proceed, leaving zero admins. The [[Admin Safety]] guards are not atomic. A production fix would use a single DynamoDB `TransactWriteCommand`. See [[Concurrency Scenarios]].

## Single-Process WebSocket

The `LocalWsBroadcaster` in the [[WebSocket Adapter Pattern]] only broadcasts to connections on the same Node.js process. If the backend were scaled horizontally, messages would not reach clients on other instances. The production path uses API Gateway WebSocket.

## Presence Ghost Users

If a browser crashes without a clean WebSocket disconnect, the user's connection record persists until TTL expiry -- up to 30 minutes. During this window, the crashed user appears as a ghost in [[Presence Indicators]]. A production improvement would add server-side ping/pong detection.

## Seed Data Fragility

The `seedIfEmpty` function checks if ANY users exist, not whether specific seed users exist. If stale test data remains, the seed script skips seeding entirely. See [[Troubleshooting]] for workarounds.

## No Frontend Route Protection by Role

An operator who navigates directly to `/admin` will see the AdminDashboard with data filtered by their `operatorId`. Admin-only actions fail with 403 on the backend, but the operator can see other operators' names. A `ProtectedAdminRoute` wrapper could prevent this.

## Operator Data Isolation Gap

The `GET /checklists` endpoint does NOT automatically filter by the requesting user's ID. The frontend sends `operatorId` as a query parameter, but an operator could craft an API request without it. The backend should enforce `operatorId = req.userId` when the requester is an operator. See [[Roles and Permissions]].

## See also

- [[Troubleshooting]] -- workarounds for issues caused by these limitations
- [[Environment Variables]] -- configuration that affects some of these behaviors
- [[System Architecture]] -- the overall design context for these tradeoffs
