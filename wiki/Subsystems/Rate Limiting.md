---
tags: [subsystem]
created: 2026-04-09
updated: 2026-05-01
---

# Rate Limiting

Two layers of rate limiting protect the system: HTTP rate limiting on Express routes via `express-rate-limit`, and WebSocket per-message rate limiting via a token-bucket implementation.

## HTTP Rate Limiting

Setup lives in `backend/src/app.ts`. Activation is gated on **either** `process.env.AWS_LAMBDA_FUNCTION_NAME` being set (any Lambda runtime) **or** `NODE_ENV === 'production'`. Local dev (`npm run dev`) and unit/E2E tests skip the limiter.

> **Trust-proxy gotcha (2026-05-01):** API Gateway sets `X-Forwarded-For` with the real client IP. Without `app.set('trust proxy', 1)`, Express ignores the header AND `express-rate-limit` throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on every request. Production logs were drowning in this error until the deployed-AWS smoke suite surfaced it. See [[Testing Strategy]].

### Limits

| Scope | Limit | Endpoint | Notes |
|---|---|---|---|
| Global | 100 req/min per IP | All routes | |
| Login | 30 *failed* attempts / 5 min per IP | `POST /api/auth/login` | `skipSuccessfulRequests: true` — successful logins don't chip away at the bucket |
| Checklist creation | 5 / min per IP | `POST /api/checklists` | |

After exceeding, the response is `{ error: "Too many ... please try again later" }` with HTTP 429.

**Login limiter history:** originally 10 attempts / 15 min counting both successes and failures. An admin doing 10 login/logout cycles during testing would lock themselves out for 15 minutes. Loosened on 2026-04-30 to 30 *failed* attempts / 5 min via `skipSuccessfulRequests: true` — brute-force protection unchanged (every wrong password still counts).

### Storage — DynamoDB-backed with prefix-namespaced keys

Production rate limiters use a **DynamoDB-backed `Store`** implemented in `backend/src/middleware/rate-limit-store.ts`. This replaced the default in-memory store as part of the [[2026-04-30 Lambda Readiness and WS Hardening]] work.

**Why DynamoDB:** under multi-instance / Lambda hosting, in-memory state is per-process. A client could trivially evade an in-memory limit by spreading requests across cold starts. DynamoDB is the single source of truth every Lambda instance can hit cheaply.

**Per-limiter prefix (2026-04-30 fix):** the store takes a `prefix` constructor arg (`'global'`, `'login'`, `'checklist-create'`). Without it, all three limiters keyed each row as `rl:<ip>` and shared a single counter — the smallest `max` always won, and a flurry of unrelated `/api/*` requests would lock out logins. Each limiter now writes to its own prefixed row:

```ts
new DynamoDbRateLimitStore('global')
new DynamoDbRateLimitStore('login')
new DynamoDbRateLimitStore('checklist-create')
```

**How it works:**
- Each rate-limit key (e.g. `login:1.2.3.4`, `global:1.2.3.4`) is one item in the `SanitizationRateLimits` table with `pk`, `count`, `resetAt` (epoch ms), and `ttl` (epoch seconds, for DynamoDB auto-eviction).
- `increment()` first tries an atomic conditional UpdateItem — `ADD count :one` if `attribute_exists(pk) AND resetAt > :now`. If the condition fails (no row, or window already expired), falls back to PutItem with `count = 1`.
- The narrow race window between failed-update and put can let one extra request slip through during window rollover; acceptable for rate-limiting precision.
- `decrement()` is a guarded `ADD count :neg` that won't go negative.
- `resetKey()` is a plain DeleteItem.

**Operations note:** to manually unstick an IP that's been rate-limited (common during testing), delete the row directly: `aws dynamodb delete-item --table-name gallo-sanitization-dev-RateLimits --key '{"pk":{"S":"login:<ip>"}}'`.

## WebSocket Rate Limiting

`backend/src/ws/limiter.ts` implements a per-`(userId, messageType)` token bucket gating every inbound WS frame after schema validation. See [[WebSocket System]] for the limit table and integration. The local-dev implementation is `InMemoryRateLimiter` (single-process Map); a `DynamoDbRateLimiter` is stubbed for future multi-instance deploy.

## See also

- [[Authentication]] -- the login endpoint protected by rate limiting
- [[Input Validation]] -- another defense layer working alongside rate limiting
- [[API Endpoints]] -- which endpoints have specific rate limits
- [[WebSocket System]] -- the per-message rate limiter on the WS path
- [[DynamoDB Tables]] -- the `SanitizationRateLimits` table
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- devlog entry for the DynamoDB store migration
