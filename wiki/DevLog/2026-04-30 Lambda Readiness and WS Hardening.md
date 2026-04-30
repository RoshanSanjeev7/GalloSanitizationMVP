---
tags: [devlog]
created: 2026-04-30
updated: 2026-04-30
---

# 2026-04-30 Lambda Readiness and WS Hardening

A multi-part hardening pass that lays the groundwork for fully-serverless hosting on AWS Lambda and closes most of the WebSocket-related items in [[Known Limitations]]. Branch: `feat/release-2-complete`. Commit: `7ab0c8c`.

## What shipped

### Lambda-ready backend

- **`backend/src/app.ts`** -- new pure Express factory (no `.listen()`, no seed, no broadcaster init). Exports `createApp()`. Both `index.ts` (long-lived dev server) and `lambda-api.ts` (Lambda handler) consume the same factory so dev/prod stay aligned.
- **`backend/src/lambda-api.ts`** -- new serverless-http wrapper. Single-flight bootstrap: builds the app + broadcaster once on cold start, caches across warm invocations. Designed to mount behind API Gateway HTTP API.
- **`backend/src/middleware/rate-limit-store.ts`** -- new DynamoDB-backed `Store` for `express-rate-limit`. Atomic conditional UpdateItem for "increment iff still in window", PutItem fallback for fresh windows, TTL on records so the table self-cleans. Required because Lambda containers don't share memory state.
- **`SanitizationRateLimits` table** -- 7th DynamoDB table. PK `pk` (string), TTL on `ttl` attribute. Provisioned in `localstack/init-aws.sh`. See [[DynamoDB Tables]].

### WebSocket hardening (Part B of the [[Known Limitations]] plan)

- **Schema validation** -- `backend/src/ws/validate.ts` defines Zod schemas mirroring the `ClientMessage` discriminated union. Every inbound frame goes through `validateClientMessage()` before reaching the routing switch. Three consecutive invalid frames close the connection (code 4400).
- **Server-side ping/pong** -- 15s ping interval, 30s pong timeout. Eliminates the previous "ghost user up to 30 minutes" window documented in [[Known Limitations]]. Ping driver lives in `LocalWsBroadcaster.init()`.
- **JWT re-verification on privileged messages** -- `subscribe`, `unsubscribe`, `machine_change` re-check `tokenExp` (cached at connect-time) before being routed. Expired tokens close with code 4401 + `TOKEN_EXPIRED` error code so the client can hit the existing 401-logout path.
- **Origin allowlist + per-IP cap** -- `verifyClient` hook rejects WS upgrades from disallowed origins before JWT-verify. `MAX_CONNECTIONS_PER_IP = 10` enforced per-IP via `connectionsByIp` map; over-cap connections close with code 4429.
- **Graceful shutdown handshake** -- SIGTERM triggers `LocalWsBroadcaster.shutdown()` which broadcasts `{type:'server_shutdown', reconnectAfterMs}` to every connection, drains intervals, and closes the server. Frontend `WebSocketClient` honors the hint on the next reconnect (with added jitter) so deploys don't thunder-herd.
- **Per-(user, msg-type) rate limiter** -- `backend/src/ws/limiter.ts` token-bucket implementation. Limits per the Bulletproofing plan: `machine_change` 5/sec burst 20, `subscribe`/`unsubscribe` 10/min burst 30, heartbeats 1/30s, dashboard sub 5/min. Over-limit returns `RATE_LIMITED` with `retryAfterMs`; 3 hits in 60s closes (code 4429). Adapter pattern leaves a stub for a future DynamoDB-backed prod implementation.

### Async PDF wiring

- **`POST /:id/submit`** publishes to `pdf-generation-queue` after the conditional status transition succeeds, behind `ENABLE_ASYNC_PDF=true`. Fire-and-forget; SQS failures never block submit.
- **`lambda-pdf.ts` idempotency guard** -- skips regeneration if `pdfKey` is already set, unless the message has `force: true`. Cheap GetItem makes SQS at-least-once redelivery safe.
- **`GET /:id/pdf/status`** now returns a presigned S3 URL when `pdfKey` exists (1-hour expiry). Frontends can download directly from S3 without round-tripping through the API.
- **Frontend `downloadChecklistPdf`** polls `/pdf/status` every 2s for up to 30s. If a presigned URL is ready, downloads via `<a download>` with no Authorization header (signature embeds auth). Falls back to the synchronous `/pdf` endpoint if polling times out or the route 404s.

### Frontend frame-tap dev tool

- **`WsDebugPanel`** -- dev-only floating panel. Tap into `wsClient.onFrame` and render every WS frame (in/out, timestamp, type, expandable body). Toggle with `Cmd+Shift+W` or `?debug=ws`; persisted via `localStorage`. Useful for verifying validation/rate-limiting/shutdown behavior live.

### Wire-format additions

- **`ServerShutdownMessage`** -- new server→client type with `reconnectAfterMs`.
- **`ErrorMessage` extended** -- optional `code` (`INVALID_JSON | INVALID_PAYLOAD | UNKNOWN_TYPE | RATE_LIMITED | TOKEN_EXPIRED | TOO_MANY_STRIKES`) and `retryAfterMs`. Backwards compatible — old clients still see `message`.

## Why

Three motivations stacked into one branch:

1. **Hosting cost / scale.** Always-on Fargate is $30-80/month flat regardless of usage. Lambda is near-zero at low traffic. The crossover is around 1M sustained req/day, well beyond MVP scale. Goal is to get the entire backend on Lambda so we pay per-request.
2. **WS gap closure.** [[Known Limitations]] called out single-process broadcaster, ghost users, no per-message validation, no per-WS rate limiting. All but the broadcaster are now closed.
3. **PDF blocking risk.** Synchronous PDF generation pegs an Express thread for the duration. At shift-change with 50 admins clicking "Export," the server chokes. Async path was 80% scaffolded; this finishes the wiring.

## What's still pending

- **Image upload presigned URLs** (Task #4) — currently the multipart endpoint runs through Lambda. Needs a `/presign` + `/finalize` flow so the browser uploads directly to S3.
- **WS connection state DynamoDB-only** (Task #11) — `LocalWsBroadcaster` still keeps an in-memory `Map`. Needs to become DynamoDB-only to support multi-instance / Lambda deploys.
- **Delta-presence broadcasting** (Task #12) — currently a 10s `setInterval` blasts presence summary regardless of changes. Replace with broadcast-on-change + heartbeat-only DB updates.
- **Comprehensive WS tests** (Task #13) — schema tests, real-server integration tests, load test, chaos test.
- **Terraform/CDK IaC** (Task #14) — nothing in the repo yet.

## Files

**New:**
- `backend/src/app.ts`
- `backend/src/lambda-api.ts`
- `backend/src/middleware/rate-limit-store.ts`
- `backend/src/ws/limiter.ts`
- `backend/src/ws/validate.ts`
- `frontend/src/components/WsDebugPanel.tsx`
- `frontend/src/components/WsDebugPanel.module.css`

**Modified:**
- `backend/src/index.ts` (slimmed to local-server entry)
- `backend/src/config/env.ts` (added `tables.rateLimits`)
- `backend/src/lambda-pdf.ts` (idempotency guard)
- `backend/src/routes/checklists.ts` (SQS publish in submit, presigned URL in `/pdf/status`)
- `backend/src/routes/checklists.test.ts` (added `getImageUrl` mock)
- `backend/src/ws/local-ws.ts` (substantial: hardening + rate limiter + shutdown)
- `backend/src/ws/messages.ts` (extended `ErrorMessage`, new `ServerShutdownMessage`)
- `frontend/src/services/api.ts` (status-poll PDF download)
- `frontend/src/services/websocket.ts` (shutdown reconnect-hint handling)
- `frontend/src/types/websocket.ts` (matching wire-format additions)
- `frontend/src/App.tsx` (mount `WsDebugPanel`)
- `frontend/src/hooks/useChecklistSync.ts` (doc comments)
- `localstack/init-aws.sh` (`SanitizationRateLimits` table)

## Verification

- `npm test` (backend): 175/175 passing.
- TypeScript strict-mode clean on changed files (pre-existing errors in `seed.ts` and `sqs.test.ts` untouched).
- `npm run dev` workflow unchanged — `serverless-http` wrapper only kicks in for the Lambda entry point.

## See also

- [[WebSocket System]] -- updated with the validation, ping/pong, rate limiter, shutdown details.
- [[Rate Limiting]] -- updated with the DynamoDB store.
- [[PDF Export]] -- updated with the now-functional async path.
- [[System Architecture]] -- updated with the Lambda hosting model.
- [[Known Limitations]] -- several items now resolved.
