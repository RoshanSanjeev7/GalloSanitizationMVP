---
tags: [decision]
created: 2026-04-09
updated: 2026-04-13
---

# JWT Design

The JWT configuration reflects the specific operational context of a bottling facility where operators work 8-hour shifts.

## 8-Hour Expiry

The initial implementation used a 1-hour token expiry. This caused a recurring problem: operators would start their shift, fill out a checklist partway, take a break, and come back to find they had been logged out mid-work. Since shifts run 8 hours, the token now matches the shift length.

The payload is minimal -- just `userId` and `role`. No email, no name, no permissions list. The backend looks up user details from [[DynamoDB Tables]] when needed (e.g., to get the name for audit entries).

## Proactive Refresh

The frontend's `api.ts` service checks the token before every API call. If the token expires within 30 minutes, `refreshTokenIfNeeded()` calls `POST /api/auth/refresh`. The refresh endpoint re-verifies the current token (via `authMiddleware` in [[Authentication]]), looks up the user, and issues a fresh 8-hour token. This means active users effectively never experience token expiry.

A `refreshPromise` singleton ensures only one refresh is in flight at a time. If multiple API calls trigger simultaneously and all detect the token is about to expire, only the first one actually refreshes -- the others await the same promise.

## Token Storage

The token lives in `localStorage.token`. This is simple and survives page refreshes, but means any XSS vulnerability could steal the token. HttpOnly cookies would be more secure but complicate the CORS setup. This trade-off is acceptable for an internal tool. See [[Known Limitations]].

## 401 Handling

If a request returns 401, the `api.ts` service clears both `localStorage.token` and `localStorage.user`, then redirects to `/login`. This handles the edge case where the token expired between the proactive check and the actual API call, or where the JWT secret changed on server restart.

## Interaction with Auto-Save

If a token expires while [[Auto-Save and Conflict Resolution]] is debouncing a save, the next save attempt will trigger a refresh (if within the 30-minute window) or get a 401 (if fully expired). On 401, the user is redirected to login and unsaved changes are lost. The 8-hour window and 30-minute proactive refresh make this practically impossible during a normal shift.

## See also

- [[Authentication]] -- the auth system this configures
- [[Auto-Save and Conflict Resolution]] -- what happens if the token expires mid-save
- [[Known Limitations]] -- localStorage token storage risks
