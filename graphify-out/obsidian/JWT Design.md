---
tags:
  - decision
---

# JWT Design

The JWT configuration reflects the specific operational context of a bottling facility where operators work 8-hour shifts.

## 8-Hour Expiry

The initial implementation used a 1-hour token expiry. This caused a recurring problem: operators would start their shift, fill out a checklist partway, take a break, and come back to find they'd been logged out mid-work. Since shifts run 8 hours, the token now matches the shift length.

The token is issued by `POST /api/auth/login`:

```typescript
jwt.sign(
  { userId: user.id, role: user.role },
  config.jwtSecret,
  { expiresIn: '8h' }
);
```

The payload is minimal -- just `userId` and `role`. No email, no name, no permissions list. The backend looks up user details from DynamoDB when needed (e.g., to get the name for audit entries).

## Proactive Refresh

The frontend's `api.ts` service checks the token before every API call:

```typescript
const expiresAt = payload.exp * 1000;
if (expiresAt - Date.now() > 30 * 60 * 1000) return; // More than 30min left
```

If the token expires within 30 minutes, `refreshTokenIfNeeded()` calls `POST /api/auth/refresh`. The refresh endpoint re-verifies the current token (via `authMiddleware`), looks up the user, and issues a fresh 8-hour token. This means active users effectively never experience token expiry.

## Preventing Concurrent Refreshes

A `refreshPromise` singleton ensures only one refresh is in flight at a time. If multiple API calls trigger simultaneously and all detect the token is about to expire, only the first one actually refreshes -- the others await the same promise.

```typescript
if (refreshPromise) return refreshPromise;
refreshPromise = (async () => {
  // ... refresh logic ...
})();
```

## Token Storage

The token lives in `localStorage.token`. This is simple and survives page refreshes, but means any XSS vulnerability could steal the token. HttpOnly cookies would be more secure but complicate the CORS setup (especially with LocalStack in development). This trade-off is acceptable for an internal tool.

## 401 Handling

If a request returns 401, the `api.ts` service clears both `localStorage.token` and `localStorage.user`, then redirects to `/login`. This handles the edge case where the token expired between the proactive check and the actual API call, or where the JWT secret changed (e.g., server restart with a new secret).

The redirect skips if the user is already on `/login` to avoid a redirect loop.

## Interaction with Auto-Save

If a token expires while [[Auto-Save and Conflict Resolution]] is debouncing a save, the next save attempt will trigger a refresh (if within the 30-minute window) or get a 401 (if fully expired). On 401, the user is redirected to login and their unsaved changes are lost. The 8-hour window and 30-minute proactive refresh make this practically impossible during a normal shift.

## See also

- [[Authentication]] -- the auth system this configures
- [[Auto-Save and Conflict Resolution]] -- what happens if the token expires mid-save
