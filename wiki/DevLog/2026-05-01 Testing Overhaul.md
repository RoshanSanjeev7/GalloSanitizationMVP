---
tags: [devlog, testing, websocket]
created: 2026-05-01
updated: 2026-05-01
---

# 2026-05-01 Testing Overhaul + Production WebSocket

## What happened

Three large pieces shipped over consecutive sessions:

1. **API Gateway WebSocket provisioned in production** (commit `94d822f`) — `lambda-ws.ts` handler + `websocket.tf` + IAM permissions. Two-operator real-time finally works against the deployed `wss://...amazonaws.com/prod` URL, not just localhost.
2. **Comprehensive test overhaul** (commits `8d55818` + `6e5ab61`) — pruned obsolete tests, added Lambda-handler unit coverage, added real-time E2E assertions, added a deployed-AWS smoke suite, added a Terraform deploy-verify script.
3. **Two real bugs surfaced and fixed by the new tests** — the `lambda-ws` disconnect-presence lag, and the `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` flood from a missing `trust proxy` setting.

## The big architectural piece — WebSocket on AWS

Earlier the local-dev WS broadcaster (`local-ws.ts`) had everything: Zod validation, ping/pong, per-IP cap, rate limiter, graceful shutdown. `apigw-ws.ts` (the production broadcaster) was provisioned as a class but had no Lambda hooked up to it. The frontend's `VITE_WS_URL` defaulted to `ws://${hostname}:4000/ws` — which on the deployed S3 site resolved to a non-existent endpoint, so production had no real-time at all.

The fix: a dedicated `lambda-ws.ts` handler that dispatches on `requestContext.routeKey`:
- **`$connect`** verifies JWT from `?token=...`, looks up the user, writes a Connection row to DDB
- **`$disconnect`** reads the row (via the new `getConnection()` helper), deletes it, broadcasts presence-leave to remaining peers on the same checklist
- **`$default`** reuses the existing Zod schemas from `validate.ts` and dispatches to subscribe / unsubscribe / machine_change / heartbeat

`infrastructure/websocket.tf` provisions the API Gateway WebSocket API with three routes ($connect, $disconnect, $default), all backed by the same Lambda. The API Lambda (HTTP routes) gets a new IAM policy `aws_iam_role_policy.lambda_api_ws_post` granting `execute-api:ManageConnections` so it can fan messages back to clients on checklist mutations. `APIGW_WS_ENDPOINT` env var on the API Lambda points at the management URL.

End-to-end verified: open the SPA in two browsers as different operators, both subscribed to the same checklist; presence appears within ~500ms, item updates propagate within ~200ms.

## Bug #1 — disconnect-presence lag

While writing the lambda-ws unit tests, I noticed a TODO in `$disconnect` that deferred presence-leave broadcasts to "the next event from any peer." That meant a teammate's avatar would persist tens of seconds (sometimes minutes) after they'd actually left, until something else triggered a presence broadcast.

The fix added a `getConnection(connectionId)` helper to `data/connections.ts` (a simple `GetCommand` against the table). `$disconnect` now reads the connection record before deleting it (so we know which checklist the leaver was on), deletes the row, then queries the GSI fresh and broadcasts `presence` to the remaining subscribers.

Covered by:
- `backend/src/__tests__/lambda-ws.test.ts` — unit test asserts presence-leave fires when leaver was on a checklist; skips when leaver was on the dashboard
- `tests/deployed/ws-api.test.ts` — real wss:// test asserts the presence frame fires within 5s of a peer's close
- `tests/multiuser-websocket.spec.ts` — Playwright test closes one of two browser contexts and asserts the avatar disappears within 5s

## Bug #2 — `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` flood (caught by the deployed CloudWatch scan)

The first run of `npm run test:deployed` had 14/15 tests pass; the failing one was the CloudWatch error scan, which found dozens of these errors per minute in `/aws/lambda/gallo-sanitization-dev-api`:

```
ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
The 'X-Forwarded-For' header is set but the Express 'trust proxy'
setting is false (default). This could indicate a misconfiguration...
```

API Gateway sets `X-Forwarded-For` with the real client IP. Without `trust proxy`, Express ignores the header AND express-rate-limit (which uses `req.ip` as its key) detects the mismatch and throws. Every single `/api/*` request was throwing.

One-line fix in `app.ts`: `app.set('trust proxy', 1)`. This was the kind of bug that's invisible in unit tests (no proxy in the test client), invisible in the application logs (the limiter still worked because it fell through to `'unknown'` keys), and only surfaces under real API Gateway. Exactly the class of bug the deployed-AWS suite is designed to catch — and it caught it on its first run.

## The testing layers, end-to-end

This refactor produced four distinct testing layers, each with a clear job:

1. **Unit + integration (vitest, mocked AWS)** — 267 tests, ~4 seconds. Covers Express routes, data layer, WS layer (validate/limiter/connections/local-ws integration/load-chaos/apigw-ws/lambda-ws/lambda-api). Auto-runs on every code edit via the test-runner-stop hook.
2. **E2E in browser (Playwright, localhost)** — `npm run test:e2e`. Includes 4 new real-time assertions on the multi-operator path.
3. **Deployed-AWS smoke (vitest, real AWS, manual)** — `npm run test:deployed`. 15 tests, ~8s, ~$0.01/run. Hits real Lambda + API Gateway HTTP + WebSocket + DynamoDB + CloudWatch.
4. **Deploy verification (`infrastructure/verify.sh`)** — Drift detection + Lambda existence + /health smoke. Run after every `terraform apply`.

Cost discipline in layer 3: ONE shared admin JWT cached at suite startup, 2-connection max for WS tests, no per-test create/delete cycles, scans CloudWatch once at end. Skips cleanly when SSO is expired.

## Pruned

- `tests/scalability-pdf.spec.ts` (entirely dead — tested `/pdf` and `/pdf/status`, both 404 since PDF moved client-side)
- `vi.mock('../data/sqs.js')` from 4 backend test files (sqs.ts was deleted earlier)

## Files added

**Tests:**
- `backend/src/__tests__/lambda-ws.test.ts` (18 tests)
- `backend/src/__tests__/lambda-api.test.ts` (5 tests)
- `backend/src/ws/__tests__/apigw-ws.test.ts` (6 tests)
- `tests/multiuser-websocket.spec.ts` — added 4 real-time assertions
- `tests/deployed/_shared.ts`
- `tests/deployed/http-api.test.ts` (7 tests)
- `tests/deployed/ws-api.test.ts` (7 tests)
- `tests/deployed/cloudwatch-errors.test.ts` (1 test)

**Infra:**
- `infrastructure/websocket.tf` (12 resources)
- `infrastructure/verify.sh`

**Code:**
- `backend/src/lambda-ws.ts` (Lambda handler)
- `backend/src/data/connections.ts` — added `getConnection()` helper
- `backend/src/app.ts` — `trust proxy` fix
- `backend/src/middleware/rate-limit-store.ts` — prefix per limiter (a separate fix shipped earlier)
- `backend/vitest.deployed.config.ts`
- `backend/package.json` + root `package.json` — `test:deployed` script

## Lessons captured

1. **Unit tests don't catch deploy-only bugs.** Both bugs surfaced by this work would never have shown up in the unit suite — one needed a real WebSocket connection to a real Lambda, the other needed a real API Gateway in front of Express. The deployed-AWS suite earned its keep on its first run.
2. **Test-driven bug discovery beats test-driven development.** I didn't write `lambda-ws.test.ts` to fix the disconnect-presence bug — the bug surfaced *while writing the test that would prove the function works*. The same is true for the trust-proxy fix and the CloudWatch error scan. The right tests force you to articulate the contract, and articulating the contract surfaces violations.
3. **Cost discipline is a design constraint.** Without the "one shared JWT, two connections max, single shared checklist" rules, the deployed suite would multiply Lambda invocations by 10× and DDB R/W by 5×. It would still cost pennies, but the *habits* would be wrong — sloppy at MVP becomes expensive at scale.
4. **Mock factory hoisting.** `vi.mock` factories hoist above outer top-level declarations. Declaring `class FakeGoneException` outside the factory and referencing it inside fails with "Cannot access before initialization." Solution: declare the fake inside the factory, expose it via dynamic import for tests that need to construct instances.

## Files touched

**Modified:**
- `backend/src/lambda-ws.ts` — disconnect-presence fix
- `backend/src/data/connections.ts` — `getConnection()` helper
- `backend/src/app.ts` — `trust proxy` fix
- `backend/src/__tests__/bulletproof.test.ts` — pruned SQS mock
- `backend/src/routes/checklists.test.ts` — pruned SQS mock + PDF-route comments
- `backend/src/routes/users.test.ts` — pruned SQS mock
- `backend/src/routes/images.test.ts` — pruned SQS mock
- `tests/multiuser-websocket.spec.ts` — +4 real-time assertions
- `infrastructure/lambda.tf` — `APIGW_WS_ENDPOINT` env var wired
- `infrastructure/build-lambdas.sh` — builds lambda-ws alongside lambda-api
- `infrastructure/outputs.tf` — `ws_gateway_url` output
- `package.json` (root) — `test:deployed` script
- `backend/package.json` — `test:deployed` script
- `wiki/Subsystems/WebSocket System.md` — production topology section
- `wiki/Architecture/System Architecture.md` — WS now live
- `wiki/Subsystems/Rate Limiting.md` — prefix fix + login fix + trust-proxy gotcha
- `wiki/Decisions/Known Limitations.md` — closed 3 items, added 6 new ones

**Created:**
- `backend/src/lambda-ws.ts`
- `backend/src/__tests__/lambda-ws.test.ts`
- `backend/src/__tests__/lambda-api.test.ts`
- `backend/src/ws/__tests__/apigw-ws.test.ts`
- `backend/vitest.deployed.config.ts`
- `infrastructure/websocket.tf`
- `infrastructure/verify.sh`
- `tests/deployed/_shared.ts`
- `tests/deployed/http-api.test.ts`
- `tests/deployed/ws-api.test.ts`
- `tests/deployed/cloudwatch-errors.test.ts`
- `wiki/Subsystems/Testing Strategy.md`
- `wiki/DevLog/2026-05-01 Testing Overhaul.md` (this file)

**Deleted:**
- `tests/scalability-pdf.spec.ts`

## Verification

- Backend unit suite: **267/267**
- Deployed-AWS smoke: **15/15** (Lambda + API Gateway HTTP + WebSocket + DynamoDB + CloudWatch)
- `infrastructure/verify.sh`: clean (no drift, both Lambdas exist, /health → 200)
- Two browsers on the deployed SPA: presence shows up <1s, item-checks propagate <200ms

## See also

- [[Testing Strategy]] — the four-layer test strategy
- [[WebSocket System]] — production topology + lambda-ws caveats
- [[Rate Limiting]] — trust-proxy gotcha + prefix fix
- [[Known Limitations]] — what this work intentionally did NOT cover
