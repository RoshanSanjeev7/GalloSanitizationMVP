---
tags:
  - runbook
---

# Troubleshooting

Common issues and their fixes, roughly ordered by frequency.

## "Invalid credentials" on login

**Cause:** The demo data was modified by E2E tests or a previous session, and the seed accounts no longer match.

**Fix:** Reseed the database:
```bash
docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed
```

The `docker compose down` is important -- just reseeding won't work because `seedIfEmpty` sees existing data and skips. You need a clean LocalStack instance. See [[Local Dev Setup]] for the full setup procedure.

## Backend crash: null GSI key

**Cause:** DynamoDB throws an error when you try to write an item with a GSI partition key set to `null` or `undefined`. For example, creating a checklist without a valid `lineId` or `operatorId`.

**Fix:** Check that the item being written has all required fields. The DynamoDB DocumentClient is configured with `removeUndefinedValues: true`, which silently drops `undefined` fields. If a GSI key is `undefined`, it gets removed, and DynamoDB rejects the write. The root cause is usually missing data upstream (e.g., the line or user doesn't exist). Check [[DynamoDB Tables]] for which fields are GSI keys.

## E2E tests timeout after 30 seconds

**Cause:** The tests expect certain data to exist (e.g., in-progress checklists on the operator dashboard). If E2E tests already consumed that data (submitted all checklists), the expected elements don't appear.

**Fix:** Reseed (same as the "Invalid credentials" fix above). Always reseed between full E2E test runs.

## Rate limiter blocking login in development

**Cause:** You ran the backend with `NODE_ENV=production` (or the env var leaked from another tool), activating the [[Rate Limiting]] rules. After 10 login attempts in 15 minutes, you're blocked.

**Fix:** Either wait 15 minutes, restart the backend (the in-memory rate limiter resets), or ensure `NODE_ENV` is not set to `production` in development. Check `backend/.env` and your shell environment.

## WebSocket not connecting

**Symptoms:** No presence indicators, no real-time updates, `ReconnectBanner` keeps showing.

**Causes and fixes:**
1. **Backend not running:** The WebSocket server runs on the same port as Express (4000). If the backend is down, WebSocket can't connect.
2. **Token missing:** The WebSocket client passes the JWT as a query parameter. If the token is expired or missing from localStorage, the backend rejects the connection. Try logging out and back in.
3. **Wrong WS_MODE:** If `WS_MODE=apigw` but there's no API Gateway endpoint configured, the broadcaster initializes incorrectly. Check [[Environment Variables]].
4. **Firewall/proxy:** Some corporate networks block WebSocket upgrades. Check browser dev tools Network tab -- the `/ws` request should show a 101 Switching Protocols response.

## `seedIfEmpty` false positive

**Cause:** The `seedIfEmpty` function checks if users exist in the database. If E2E tests created users but didn't clean up, the function sees existing data and skips seeding -- even though the demo users might not exist.

**Fix:** Full tear down and reseed: `docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed`.

## Port 4000 already in use

**Cause:** A previous backend process didn't shut down cleanly.

**Fix:**
```bash
lsof -i :4000           # Find the process
kill -9 <PID>           # Kill it
npm run dev             # Restart
```

Or change the port in `backend/.env` (`PORT=4001`) and update `FRONTEND_ORIGIN` and the Vite proxy accordingly.

## LocalStack containers not starting

**Cause:** Docker Desktop is not running, or port 4566 is in use.

**Fix:** Start Docker Desktop. Check for port conflicts: `lsof -i :4566`. If another LocalStack instance is running, stop it with `docker compose down` from the other project.

## See also

- [[Local Dev Setup]] -- the baseline that should work
- [[Rate Limiting]] -- why login might be blocked
- [[DynamoDB Tables]] -- understanding null GSI key errors
