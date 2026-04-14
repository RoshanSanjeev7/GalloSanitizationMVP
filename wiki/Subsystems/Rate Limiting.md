---
tags: [subsystem]
created: 2026-04-09
updated: 2026-04-13
---

# Rate Limiting

The backend uses `express-rate-limit` to throttle requests in production. All rate limiters are disabled in development and test environments to avoid interfering with E2E tests.

## Configuration

Rate limiting setup lives in `backend/src/index.ts`. The `isProduction` flag (`process.env.NODE_ENV === 'production'`) gates all limiter activation.

### Global Limiter

100 requests per minute per IP. Applied to all routes via `app.use(globalLimiter)`.

### Login Limiter

10 login attempts per 15 minutes per IP. Applied specifically to `POST /api/auth/login`. Protects [[Authentication]] against brute force password guessing. After 10 failed attempts, the response is: `{ error: "Too many login attempts, please try again later" }`.

### Checklist Creation Limiter

5 checklists per minute per IP. Applied to `POST /api/checklists`. Prevents rapid checklist creation from accidental button spam or intentional abuse.

## In Dev/Test

When `NODE_ENV` is not `'production'`, each limiter is replaced with a passthrough middleware. This is necessary because the Playwright E2E tests make many rapid operations. With rate limiting active, tests would fail intermittently. See [[Troubleshooting]] for the "rate limiter blocking logins" issue.

## Storage

The current implementation uses the default in-memory store. Rate limit counts are per-process and reset on server restart. If the backend scales to multiple processes, each process maintains its own count -- a user could exceed the intended limit. Production should switch to `rate-limit-redis` for cross-process rate limiting. See [[Known Limitations]].

## See also

- [[Authentication]] -- the login endpoint protected by rate limiting
- [[Input Validation]] -- another defense layer working alongside rate limiting
- [[API Endpoints]] -- which endpoints have specific rate limits
