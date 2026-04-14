---
tags: [architecture]
created: 2026-04-09
updated: 2026-04-13
---

# Authentication

All backend routes require a valid JWT. The system uses two Express middleware functions defined in `backend/src/middleware/auth.ts`.

## authMiddleware

Every route file calls `router.use(authMiddleware)` as its first line. The middleware extracts the `Authorization: Bearer <token>` header, verifies it against `config.jwtSecret` using `jsonwebtoken`, and sets `req.userId` and `req.userRole` on the request object. If the token is missing or invalid, it returns 401 immediately.

The JWT payload contains only `userId` and `role`. No permissions array, no scopes -- the role is enough because this app has exactly two roles. See [[Roles and Permissions]] for what each role can do.

## adminOnly

Applied after `authMiddleware` on specific routes. Checks `req.userRole !== 'admin'` and returns 403 if it fails. Used on: user create/update/delete, template create/update/delete, checklist approve/deny/delete, PDF export, audit log access, and mark-all-viewed.

## Token Lifecycle

Tokens are issued on `POST /api/auth/login` with an 8-hour expiry. See [[JWT Design]] for why 8 hours was chosen over shorter durations.

The frontend's `api.ts` service handles the full token lifecycle:

1. **Storage:** Token goes in `localStorage.token`, user object in `localStorage.user`.
2. **Injection:** Every `request()` call adds `Authorization: Bearer <token>` automatically.
3. **Proactive refresh:** Before each API call, `refreshTokenIfNeeded()` checks if the token expires within 30 minutes. If so, it calls `POST /api/auth/refresh` to get a new token. A `refreshPromise` singleton prevents concurrent refresh calls.
4. **401 handling:** If any response comes back 401, the service clears `localStorage` and redirects to `/login`. This catches expired tokens that slipped past proactive refresh.

## Password Storage

Currently plaintext comparison: `user.password !== password`. This is acceptable for local development with seeded demo data but must be replaced with bcrypt or Argon2 before any production deployment. See [[Known Limitations]].

## Brute Force Protection

The login endpoint has a dedicated [[Rate Limiting]] rule: 10 attempts per 15 minutes in production. This is separate from the global rate limiter.

## Frontend Auth

On the frontend side, `App.tsx` defines two guard components:

- **`ProtectedRoute`**: Reads `state.auth.user` from Redux. If null, redirects to `/login`.
- **`HomeRedirect`**: Routes admins to `/admin` and operators to `/` (operator dashboard).

See [[API Endpoints]] for which endpoints require which auth level.

## See also

- [[Roles and Permissions]] -- what authentication unlocks
- [[JWT Design]] -- the design decisions behind token configuration
- [[Rate Limiting]] -- brute force protection on the login endpoint
