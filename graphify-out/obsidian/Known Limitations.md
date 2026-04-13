---
tags:
  - architecture
  - decision
---

# Known Limitations

This page aggregates all MVP shortcuts and known issues that should be addressed before production deployment.

## Plaintext Passwords

User passwords are stored in DynamoDB without hashing. The [[Authentication]] system compares plaintext values directly. Before production, all password storage must migrate to bcrypt (or argon2) with proper salt rounds. Existing passwords would need a one-time hash migration.

## In-Memory Rate Limiter

The [[Rate Limiting]] middleware uses `express-rate-limit` with its default in-memory store. This works fine for a single-process dev server but breaks with multiple processes or containers -- each instance maintains its own counter, so an attacker can multiply their allowed requests by the number of instances. Production must switch to a Redis-backed store (e.g., `rate-limit-redis`) for accurate cross-process rate limiting.

## localStorage Token Storage

The [[JWT Design]] stores the access token in `localStorage`, which is accessible to any JavaScript running on the page. An XSS vulnerability would allow an attacker to steal the token. Production should consider `httpOnly` cookies for token storage, which are inaccessible to client-side JavaScript.

## No Input Validation On

Several fields lack validation that production would require: template structure (no schema validation on the `machines` array shape), email format (no regex check), and password complexity (no minimum length or character requirements). See [[Input Validation]] for what IS validated -- this limitation covers what is not.

## Admin Delete Race Condition

Two admins could theoretically delete each other simultaneously. Both `getAllUsers` queries return 2 admins, both pass the "more than one admin" check, both deletions proceed, leaving zero admins. The [[Admin Safety]] guards are not atomic. A production fix would wrap the admin-count check and deletion in a single DynamoDB `TransactWriteCommand` with a `ConditionExpression`. See [[Concurrency Scenarios]] for related race condition analysis.

## Single-Process WebSocket

The `LocalWsBroadcaster` in the [[WebSocket Adapter Pattern]] only broadcasts to connections on the same Node.js process. If the backend were scaled horizontally, messages would only reach clients connected to the same instance. The production path uses API Gateway WebSocket, which handles multi-process broadcasting natively.

## Presence Ghost Users

If a browser crashes without a clean WebSocket disconnect (no `close` event fires), the user's connection record in DynamoDB persists until the TTL expires -- up to 30 minutes from the last heartbeat. During this window, the crashed user appears as a ghost in [[Presence Indicators]] lists. A production improvement would add server-side ping/pong detection to identify dead connections faster.

## Seed Data Fragility

The `seedIfEmpty` function checks if ANY users exist in the table, not whether the specific seed users exist. If stale test data remains in the table (e.g., from a previous test run), the seed script skips seeding entirely, leaving the database in an inconsistent state. See [[Troubleshooting]] for workarounds when this occurs.

## See also

- [[Troubleshooting]] -- workarounds for issues caused by these limitations
- [[Environment Variables]] -- configuration that affects some of these behaviors
- [[System Architecture]] -- the overall design context for these tradeoffs
