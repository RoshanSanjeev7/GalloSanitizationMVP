---
tags:
  - backend
---

# Rate Limiting

The backend uses `express-rate-limit` to throttle requests in production. All rate limiters are disabled in development and test environments to avoid interfering with E2E tests that make many rapid API calls.

## Configuration

Rate limiting setup lives in `backend/src/index.ts`. The `isProduction` flag (`process.env.NODE_ENV === 'production'`) gates all limiter activation.

### Global Limiter

```typescript
windowMs: 60 * 1000,  // 1 minute window
max: 100,             // 100 requests per minute per IP
```

Applied to all routes via `app.use(globalLimiter)`. Uses standard rate limit headers (`RateLimit-*`) and disables legacy `X-RateLimit-*` headers.

### Login Limiter

```typescript
windowMs: 15 * 60 * 1000,  // 15 minute window
max: 10,                    // 10 login attempts per 15 minutes per IP
```

Applied specifically to `POST /api/auth/login`. This protects [[Authentication]] against brute force password guessing. After 10 failed attempts, the response is: `{ error: "Too many login attempts, please try again later" }`.

### Checklist Creation Limiter

```typescript
windowMs: 60 * 1000,  // 1 minute window
max: 5,               // 5 checklists per minute per IP
```

Applied to `POST /api/checklists`. Prevents rapid checklist creation (whether accidental button spam or intentional abuse).

## In Dev/Test

When `NODE_ENV` is not `'production'`, each limiter is replaced with a passthrough middleware: `(_req, _res, next) => next()`. This means the limiter code path still exists (the middleware is mounted on the same routes) but never blocks requests.

This is necessary because the Playwright E2E tests create users, log in, create checklists, and perform many operations in rapid succession. With rate limiting active, tests would fail intermittently. See [[Troubleshooting]] for the "rate limiter blocking logins" issue.

## Storage

The current implementation uses the default in-memory store. This means rate limit counts are per-process and reset on server restart. If the backend scales to multiple processes (e.g., behind a load balancer), each process maintains its own count -- a user could make 100 requests per process per minute instead of 100 total.

For production with multiple processes, the store should be switched to `rate-limit-redis` (or similar) to share counts across instances.

## See also

- [[Authentication]] -- the login endpoint protected by rate limiting
- [[Input Validation]] -- another defense layer working alongside rate limiting
- [[API Endpoints]] -- which endpoints have specific rate limits
