---
tags: [subsystem]
created: 2026-04-09
updated: 2026-04-30
---

# Rate Limiting

Two layers of rate limiting protect the system: HTTP rate limiting on Express routes via `express-rate-limit`, and WebSocket per-message rate limiting via a token-bucket implementation.

## HTTP Rate Limiting

Setup lives in `backend/src/app.ts`. The `isProduction` flag (`process.env.NODE_ENV === 'production'`) gates limiter activation; dev/test get passthrough middleware so [[Running Tests|E2E tests]] don't trip the limits.

### Limits

| Scope | Limit | Endpoint |
|---|---|---|
| Global | 100 req/min per IP | All routes |
| Login | 10 attempts / 15 min per IP | `POST /api/auth/login` |
| Checklist creation | 5 / min per IP | `POST /api/checklists` |

After exceeding, the response is `{ error: "Too many ... please try again later" }` with HTTP 429.

### Storage

Production rate limiters use a **DynamoDB-backed `Store`** implemented in `backend/src/middleware/rate-limit-store.ts`. This replaced the default in-memory store as part of the [[2026-04-30 Lambda Readiness and WS Hardening]] work.

**Why DynamoDB:** under multi-instance / Lambda hosting, in-memory state is per-process. A client could trivially evade an in-memory limit by spreading requests across cold starts. DynamoDB is the single source of truth every Lambda instance can hit cheaply.

**How it works:**
- Each rate-limit key (e.g. `ip:1.2.3.4`, `user:u123`) is one item in the `SanitizationRateLimits` table with `pk`, `count`, `resetAt` (epoch ms), and `ttl` (epoch seconds, for DynamoDB auto-eviction).
- `increment()` first tries an atomic conditional UpdateItem — `ADD count :one` if `attribute_exists(pk) AND resetAt > :now`. If the condition fails (no row, or window already expired), falls back to PutItem with `count = 1`.
- The narrow race window between failed-update and put can let one extra request slip through during window rollover; acceptable for rate-limiting precision.
- `decrement()` is a guarded `ADD count :neg` that won't go negative.
- `resetKey()` is a plain DeleteItem.

**Keys observed:** `rl:<express-rate-limit's chosen key>` — the wrapper prepends `rl:` to keep the table namespaced if it ever gets reused for other counters.

## WebSocket Rate Limiting

`backend/src/ws/limiter.ts` implements a per-`(userId, messageType)` token bucket gating every inbound WS frame after schema validation. See [[WebSocket System]] for the limit table and integration. The local-dev implementation is `InMemoryRateLimiter` (single-process Map); a `DynamoDbRateLimiter` is stubbed for future multi-instance deploy.

## See also

- [[Authentication]] -- the login endpoint protected by rate limiting
- [[Input Validation]] -- another defense layer working alongside rate limiting
- [[API Endpoints]] -- which endpoints have specific rate limits
- [[WebSocket System]] -- the per-message rate limiter on the WS path
- [[DynamoDB Tables]] -- the `SanitizationRateLimits` table
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- devlog entry for the DynamoDB store migration
