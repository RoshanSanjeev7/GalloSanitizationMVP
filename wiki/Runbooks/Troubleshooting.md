---
tags: [runbook]
created: 2026-04-09
updated: 2026-04-13
---

# Troubleshooting

Common issues and their fixes, roughly ordered by frequency.

## "Invalid credentials" on login

**Cause:** The demo data was modified by E2E tests or a previous session.

**Fix:** Reseed the database:
```bash
docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed
```

The `docker compose down` is important -- just reseeding will not work because `seedIfEmpty` sees existing data and skips. You need a clean LocalStack instance. See [[Local Dev Setup]] for the full setup procedure.

## Backend crash: null GSI key

**Cause:** DynamoDB throws an error when you try to write an item with a GSI partition key set to `null` or `undefined`. The DynamoDB DocumentClient is configured with `removeUndefinedValues: true`, which silently drops `undefined` fields.

**Fix:** Check that the item being written has all required fields. The root cause is usually missing data upstream (e.g., the line or user does not exist). Check [[DynamoDB Tables]] for which fields are GSI keys.

## E2E tests timeout after 30 seconds

**Cause:** The tests expect certain data to exist (e.g., in-progress checklists). If E2E tests already consumed that data, the expected elements do not appear.

**Fix:** Reseed (same as above). Always reseed between full E2E test runs. See [[Running Tests]] for details.

## Rate limiter blocking login in development

**Cause:** You ran the backend with `NODE_ENV=production`, activating [[Rate Limiting]] rules. After 10 login attempts in 15 minutes, you are blocked.

**Fix:** Wait 15 minutes, restart the backend (the in-memory rate limiter resets), or ensure `NODE_ENV` is not set to `production`. Check `backend/.env` and your shell environment.

## WebSocket not connecting

**Symptoms:** No [[Presence Indicators]], no real-time updates, `ReconnectBanner` keeps showing.

**Causes and fixes:**
1. **Backend not running:** The WebSocket server runs on the same port as Express (4000).
2. **Token missing:** The WebSocket client passes the JWT as a query parameter. If expired or missing, the backend rejects the connection. Try logging out and back in.
3. **Wrong WS_MODE:** If `WS_MODE=apigw` but there is no API Gateway endpoint, the broadcaster initializes incorrectly. Check [[Environment Variables]].
4. **Firewall/proxy:** Some corporate networks block WebSocket upgrades. Check the Network tab for a 101 Switching Protocols response on `/ws`.

## seedIfEmpty false positive

**Cause:** The `seedIfEmpty` function checks if users exist. If E2E tests created users but did not clean up, the function sees existing data and skips seeding. See [[Known Limitations]].

**Fix:** Full tear down and reseed: `docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed`.

## Port 4000 already in use

**Cause:** A previous backend process did not shut down cleanly.

**Fix:**
```bash
lsof -i :4000           # Find the process
kill -9 <PID>           # Kill it
npm run dev             # Restart
```

Or change the port in `backend/.env` (`PORT=4001`) and update the Vite proxy accordingly.

## LocalStack containers not starting

**Cause:** Docker Desktop is not running, or port 4566 is in use.

**Fix:** Start Docker Desktop. Check for port conflicts: `lsof -i :4566`. If another LocalStack instance is running, stop it with `docker compose down` from the other project.

## See also

- [[Local Dev Setup]] -- the baseline that should work
- [[Rate Limiting]] -- why login might be blocked
- [[DynamoDB Tables]] -- understanding null GSI key errors
