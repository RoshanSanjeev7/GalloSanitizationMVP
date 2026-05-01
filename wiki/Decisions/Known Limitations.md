---
tags: [decision]
created: 2026-04-09
updated: 2026-05-01
---

# Known Limitations

All MVP shortcuts and known issues that should be addressed before production deployment. Items are prioritized by severity:

- **P0 (production blocker):** Must fix before any real user data enters the system.
- **P1 (should fix):** Causes real problems under moderate usage. Fix before scaling.
- **P2 (acceptable for MVP):** Known tradeoff that works for demo/dev but needs improvement.

## Plaintext Passwords -- P0

User passwords are stored in DynamoDB without hashing. The [[Authentication]] system compares plaintext values directly. Before production, all password storage must migrate to bcrypt or argon2 with proper salt rounds.

**Recommended fix:** Use bcrypt with 12 salt rounds. Hash on user creation (`POST /users`) and in the seed script. Compare with `bcrypt.compare()` in the login route. No password change endpoint exists -- add `PUT /auth/password`. Migration: re-run seed with hashed passwords, or batch-update existing users with a one-time script.

## ~~In-Memory Rate Limiter~~ -- RESOLVED 2026-04-30

**Status: Resolved.** Production rate limiters now use a DynamoDB-backed `Store` (`backend/src/middleware/rate-limit-store.ts`) backed by the `SanitizationRateLimits` table. Atomic conditional UpdateItem ensures multi-instance / Lambda deploys share the same counters. See [[Rate Limiting]] and [[2026-04-30 Lambda Readiness and WS Hardening]].

## localStorage Token Storage -- P2

The [[JWT Design]] stores the access token in `localStorage`, which is accessible to any JavaScript running on the page. An XSS vulnerability would allow token theft. Production should consider `httpOnly` cookies.

## Missing Input Validation -- P1

Several fields lack validation: template structure (no schema validation on the `machines` array shape), email format (no regex check), and password complexity (no minimum length). See [[Input Validation]] for what IS validated.

## Admin Delete Race Condition -- P1

Two admins could theoretically delete each other simultaneously. Both `getAllUsers` queries return 2 admins, both pass the check, both proceed, leaving zero admins. The [[Admin Safety]] guards are not atomic. A production fix would use a single DynamoDB `TransactWriteCommand`. See [[Concurrency Scenarios]].

**Recommended fix:** Replace the `getAllUsers()` count check + `deleteUserWithEmailLock()` with a single `TransactWriteCommand` that includes a `ConditionExpression`:
- Delete user item WHERE admin_count > 1
- Delete EMAIL# lock item
The condition check and delete must be in the same transaction. Alternatively: use an atomic counter in a separate "admin_count" item.

## Single-Process WebSocket -- P2 (partially mitigated)

The `LocalWsBroadcaster` in the [[WebSocket Adapter Pattern]] still keeps an in-memory `Map` of connections, so broadcasts on a single node only reach clients on that node. The production path is `ApiGatewayBroadcaster` which uses DynamoDB exclusively and is multi-instance safe.

**Remaining work:** drop the in-memory Map in `LocalWsBroadcaster` and rely on DynamoDB only (mirroring `ApiGatewayBroadcaster`). Tracked as Task #11 in the [[2026-04-30 Lambda Readiness and WS Hardening]] follow-up.

## ~~Presence Ghost Users~~ -- RESOLVED 2026-04-30

**Status: Resolved.** `LocalWsBroadcaster` now drives a server-side ping every 15 seconds with a 30-second pong timeout. Connections without a recent pong are terminated and removed from both the in-memory map and DynamoDB immediately. The 30-minute TTL is now only a backstop for catastrophic failures (process crash); typical dead-connection cleanup is sub-30s. See [[WebSocket System]] and [[2026-04-30 Lambda Readiness and WS Hardening]].

## ~~No WebSocket Message Validation~~ -- RESOLVED 2026-04-30

**Status: Resolved.** Every inbound WS frame is validated against a Zod discriminated union (`backend/src/ws/validate.ts`) before being routed. Invalid frames return a structured error with `code` and trip a strike counter; three consecutive invalid frames close the connection. See [[WebSocket System]].

## ~~No Per-WebSocket-Message Rate Limiting~~ -- RESOLVED 2026-04-30

**Status: Resolved.** A token-bucket rate limiter in `backend/src/ws/limiter.ts` enforces per-(userId, messageType) limits matching the bulletproofing plan. Over-limit frames return `RATE_LIMITED` with `retryAfterMs`; sustained floods (3 hits in 60s) close the connection. See [[Rate Limiting]] and [[WebSocket System]].

## Seed Data Fragility -- P2

The `seedIfEmpty` function checks if ANY users exist, not whether specific seed users exist. If stale test data remains, the seed script skips seeding entirely. See [[Troubleshooting]] for workarounds.

## ~~No Frontend Route Protection by Role -- P2~~ RESOLVED

**Status: Resolved.** `ProtectedAdminRoute` is implemented in `App.tsx` and wraps `/admin`, `/settings/roles`, `/settings/factories`, `/settings/audit`, `/templates/create`, and `/checklist/:id/review`. Non-admin users are redirected to `/`.

## Operator Data Isolation Gap -- P0

The `GET /checklists` endpoint does NOT automatically filter by the requesting user's ID. The frontend sends `operatorId` as a query parameter, but an operator could craft an API request without it. The backend should enforce `operatorId = req.userId` when the requester is an operator. See [[Roles and Permissions]].

**Recommended fix:** In the `GET /checklists` route handler, after all existing filters, add:
```
if (req.userRole === 'operator') {
  checklists = checklists.filter(c => c.operatorId === req.userId);
}
```
This is route-level, not middleware. Admins are NOT filtered by `operatorId` (they are filtered by `factoryIds` instead).

## Factory Cascade Missing -- P1

Deleting a factory (`DELETE /api/factories/:id`) hard-deletes the factory record but does not clean up references in Lines, Checklists, or Users. Lines retain a stale `factoryId`, checklists remain visible to users who had that factory, and users keep the factory in their `factoryIds` array. See [[Factories]] for the full cascade behavior analysis.

**Recommended fix:** Soft-delete factory (like templates). Set `deleted: true` + 30-day TTL. On soft-delete: scan users with this `factoryId` in `factoryIds`, remove it from their arrays. Lines and checklists keep their `factoryId` (historical data). Show a warning in the UI listing affected users/lines before confirming delete.

## ~~Production WebSocket not provisioned~~ -- RESOLVED 2026-05-01

**Status: Resolved.** API Gateway WebSocket API + dedicated `lambda-ws.ts` are now live in production. Real-time presence, item updates, and disconnect-leave broadcasts work end-to-end against the deployed `wss://...amazonaws.com/prod` endpoint. See [[WebSocket System]] and [[2026-05-01 Testing Overhaul]].

## ~~lambda-ws disconnect-presence lag~~ -- RESOLVED 2026-05-01

**Status: Resolved.** `$disconnect` now reads the connection record before deleting and broadcasts a presence-leave to remaining peers on the same checklist. Previously, peers only saw a teammate vanish on the next event from any peer (a real lag in the indicator). See [[WebSocket System]].

## ~~ERR_ERL_UNEXPECTED_X_FORWARDED_FOR flood~~ -- RESOLVED 2026-05-01

**Status: Resolved.** API Gateway sets `X-Forwarded-For` with the real client IP. Without `app.set('trust proxy', 1)`, Express ignored the header AND express-rate-limit threw `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on every single request. Production logs were drowning in this error. The deployed-AWS CloudWatch error scan surfaced it; one-line fix in `app.ts`. See [[Rate Limiting]] and [[Testing Strategy]].

## lambda-ws lacks per-message rate limiting / strikes / JWT recheck -- P2

The local-ws path (`backend/src/ws/local-ws.ts`) has all three of these protections; `lambda-ws.ts` doesn't, intentionally — API Gateway WebSocket invocations are request-scoped (not sustained connections) and API Gateway provides an idle timeout + per-stage throttle. The exposure is bounded but real:

- **Rate limit:** a malicious client can flood any subscribed checklist with `machine_change` messages until the API Gateway stage throttle (1000 burst / 500 sustained) kicks in. Each message fires a presence broadcast, multiplying load on every peer.
- **JWT recheck:** a token that expires mid-session is still accepted by `$default` until API Gateway's 10-min idle timeout drops the connection. Maximum window for stolen-token mid-session use ≈ 10 minutes.
- **Strikes:** three garbage frames in a row don't auto-disconnect; the client gets `INVALID_*` error frames and stays connected.

**Recommended fix when needed:** port the DDB-backed rate limiter (already used for HTTP) to `lambda-ws.ts`, keyed on `(userId, messageType)`. JWT recheck on privileged messages can decode the token cached at $connect (without DB lookup). Strikes counter can be a small `count` attribute on the Connections row.

## No load tests against deployed AWS -- P2

`load-chaos.test.ts` exercises the local-ws broadcaster up to 8 concurrent connections (the per-IP cap is 10). Nothing tests deployed AWS behavior under concurrency — N admins simultaneously approving submissions, M operators on the same checklist firing updates, etc. **Recommended fix:** add `tests/deployed/load.test.ts` (manual-only) that opens 50 WebSocket connections (from different "users") and measures fan-out latency p99. Skip in CI.

## No automated rollback -- P1

A broken `terraform apply` requires manual intervention. There's no canary, no blue/green deployment, no automated revert if `verify.sh` fails after the apply. **Recommended fix:** wire `verify.sh` into a post-apply step in CI; if it fails, automatically `terraform apply` the previous tagged commit. Realistically this needs a CI pipeline first (currently absent).

## No CI pipeline -- P1

Tests run on developer machines via `npm test` and on the test-runner-stop hook. There's no GitHub Actions / GitLab CI / similar that runs the suite on every push. Pull requests can land without test verification. **Recommended fix:** GitHub Actions workflow that runs vitest + tsc on every PR; gate merges on green. Playwright + deployed-AWS suite remain manual-only (need infra credentials in CI).

## SPA served over HTTP, no CDN -- P1

The frontend is hosted at the raw S3 website endpoint (`http://gallo-...s3-website-us-west-2.amazonaws.com`) — HTTP, not HTTPS, no CloudFront, no custom domain. Modern browsers warn on plain-HTTP forms; real users would be hesitant to log in. **Recommended fix:** add CloudFront distribution in Terraform, attach an ACM certificate (Route 53 validation), point the SPA at the CloudFront URL. Adds ~$1/month + cert-renewal automation.

## No DDB throttle / latency / cost alarms -- P2

Only `aws_cloudwatch_metric_alarm.api_lambda_errors` exists. There's no alarm for DynamoDB throttling (would matter under burst load), Lambda latency p99 (cold-start regressions), cost anomaly detection (a runaway loop could rack up bills), or WS Lambda errors. **Recommended fix:** add 4-5 more CloudWatch alarms feeding the existing SNS topic.

## No automated dependency updates -- P2

`package.json` deps are pinned at install time and updated manually. Security patches in `@aws-sdk/*`, `express`, `ws`, `jsonwebtoken` aren't picked up automatically. **Recommended fix:** Dependabot or Renovate config; weekly PR cadence; CI gate on test pass.

## See also

- [[Troubleshooting]] -- workarounds for issues caused by these limitations
- [[Environment Variables]] -- configuration that affects some of these behaviors
- [[System Architecture]] -- the overall design context for these tradeoffs
- [[Error Handling]] -- how these limitations manifest as error conditions
- [[Testing Strategy]] -- the gap inventory under "What this strategy does NOT cover"
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- closed several P1/P2 items above
- [[2026-05-01 Testing Overhaul]] -- closed the production-WebSocket and disconnect-presence items above
