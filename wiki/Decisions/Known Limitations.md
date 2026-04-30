---
tags: [decision]
created: 2026-04-09
updated: 2026-04-30
---

# Known Limitations

All MVP shortcuts and known issues that should be addressed before production deployment. Items are prioritized by severity:

- **P0 (production blocker):** Must fix before any real user data enters the system.
- **P1 (should fix):** Causes real problems under moderate usage. Fix before scaling.
- **P2 (acceptable for MVP):** Known tradeoff that works for demo/dev but needs improvement.

## Plaintext Passwords -- P0

User passwords are stored in DynamoDB without hashing. The [[Authentication]] system compares plaintext values directly. Before production, all password storage must migrate to bcrypt or argon2 with proper salt rounds.

**Recommended fix:** Use bcrypt with 12 salt rounds. Hash on user creation (`POST /users`) and in the seed script. Compare with `bcrypt.compare()` in the login route. No password change endpoint exists -- add `PUT /auth/password`. Migration: re-run seed with hashed passwords, or batch-update existing users with a one-time script.

## ~~In-Memory Rate Limiter~~ -- RESOLVED 2026-04-30

**Status: Resolved.** Production rate limiters now use a DynamoDB-backed `Store` (`backend/src/middleware/rate-limit-store.ts`) backed by the `SanitizationRateLimits` table. Atomic conditional UpdateItem ensures multi-instance / Lambda deploys share the same counters. See [[Rate Limiting]] and [[2026-04-30 Lambda Readiness and WS Hardening]].

## localStorage Token Storage -- P2

The [[JWT Design]] stores the access token in `localStorage`, which is accessible to any JavaScript running on the page. An XSS vulnerability would allow token theft. Production should consider `httpOnly` cookies.

## Missing Input Validation -- P1

Several fields lack validation: template structure (no schema validation on the `machines` array shape), email format (no regex check), and password complexity (no minimum length). See [[Input Validation]] for what IS validated.

## Admin Delete Race Condition -- P1

Two admins could theoretically delete each other simultaneously. Both `getAllUsers` queries return 2 admins, both pass the check, both proceed, leaving zero admins. The [[Admin Safety]] guards are not atomic. A production fix would use a single DynamoDB `TransactWriteCommand`. See [[Concurrency Scenarios]].

**Recommended fix:** Replace the `getAllUsers()` count check + `deleteUserWithEmailLock()` with a single `TransactWriteCommand` that includes a `ConditionExpression`:
- Delete user item WHERE admin_count > 1
- Delete EMAIL# lock item
The condition check and delete must be in the same transaction. Alternatively: use an atomic counter in a separate "admin_count" item.

## Single-Process WebSocket -- P2 (partially mitigated)

The `LocalWsBroadcaster` in the [[WebSocket Adapter Pattern]] still keeps an in-memory `Map` of connections, so broadcasts on a single node only reach clients on that node. The production path is `ApiGatewayBroadcaster` which uses DynamoDB exclusively and is multi-instance safe.

**Remaining work:** drop the in-memory Map in `LocalWsBroadcaster` and rely on DynamoDB only (mirroring `ApiGatewayBroadcaster`). Tracked as Task #11 in the [[2026-04-30 Lambda Readiness and WS Hardening]] follow-up.

## ~~Presence Ghost Users~~ -- RESOLVED 2026-04-30

**Status: Resolved.** `LocalWsBroadcaster` now drives a server-side ping every 15 seconds with a 30-second pong timeout. Connections without a recent pong are terminated and removed from both the in-memory map and DynamoDB immediately. The 30-minute TTL is now only a backstop for catastrophic failures (process crash); typical dead-connection cleanup is sub-30s. See [[WebSocket System]] and [[2026-04-30 Lambda Readiness and WS Hardening]].

## ~~No WebSocket Message Validation~~ -- RESOLVED 2026-04-30

**Status: Resolved.** Every inbound WS frame is validated against a Zod discriminated union (`backend/src/ws/validate.ts`) before being routed. Invalid frames return a structured error with `code` and trip a strike counter; three consecutive invalid frames close the connection. See [[WebSocket System]].

## ~~No Per-WebSocket-Message Rate Limiting~~ -- RESOLVED 2026-04-30

**Status: Resolved.** A token-bucket rate limiter in `backend/src/ws/limiter.ts` enforces per-(userId, messageType) limits matching the bulletproofing plan. Over-limit frames return `RATE_LIMITED` with `retryAfterMs`; sustained floods (3 hits in 60s) close the connection. See [[Rate Limiting]] and [[WebSocket System]].

## Seed Data Fragility -- P2

The `seedIfEmpty` function checks if ANY users exist, not whether specific seed users exist. If stale test data remains, the seed script skips seeding entirely. See [[Troubleshooting]] for workarounds.

## ~~No Frontend Route Protection by Role -- P2~~ RESOLVED

**Status: Resolved.** `ProtectedAdminRoute` is implemented in `App.tsx` and wraps `/admin`, `/settings/roles`, `/settings/factories`, `/settings/audit`, `/templates/create`, and `/checklist/:id/review`. Non-admin users are redirected to `/`.

## Operator Data Isolation Gap -- P0

The `GET /checklists` endpoint does NOT automatically filter by the requesting user's ID. The frontend sends `operatorId` as a query parameter, but an operator could craft an API request without it. The backend should enforce `operatorId = req.userId` when the requester is an operator. See [[Roles and Permissions]].

**Recommended fix:** In the `GET /checklists` route handler, after all existing filters, add:
```
if (req.userRole === 'operator') {
  checklists = checklists.filter(c => c.operatorId === req.userId);
}
```
This is route-level, not middleware. Admins are NOT filtered by `operatorId` (they are filtered by `factoryIds` instead).

## Factory Cascade Missing -- P1

Deleting a factory (`DELETE /api/factories/:id`) hard-deletes the factory record but does not clean up references in Lines, Checklists, or Users. Lines retain a stale `factoryId`, checklists remain visible to users who had that factory, and users keep the factory in their `factoryIds` array. See [[Factories]] for the full cascade behavior analysis.

**Recommended fix:** Soft-delete factory (like templates). Set `deleted: true` + 30-day TTL. On soft-delete: scan users with this `factoryId` in `factoryIds`, remove it from their arrays. Lines and checklists keep their `factoryId` (historical data). Show a warning in the UI listing affected users/lines before confirming delete.

## See also

- [[Troubleshooting]] -- workarounds for issues caused by these limitations
- [[Environment Variables]] -- configuration that affects some of these behaviors
- [[System Architecture]] -- the overall design context for these tradeoffs
- [[Error Handling]] -- how these limitations manifest as error conditions
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- closed several P1/P2 items above
