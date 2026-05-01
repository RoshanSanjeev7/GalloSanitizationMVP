---
tags: [subsystem]
created: 2026-05-01
updated: 2026-05-01
---

# Testing Strategy

Three layers, each catching a different class of bug. Concentrated coverage on risky surfaces (Lambda handlers, WebSocket fan-out, deployed integration), light coverage on trivial CRUD. **No coverage-percentage target** — we measure by which failure modes the suite would catch, not by line count.

## Layer 1: Unit + integration (vitest, mocked AWS)

`npm test` from the project root, or `npm test --workspace=backend`. ~270 tests. Every test runs in <100ms; the full suite finishes in ~4s.

**What it covers:**
- Express route handlers (`backend/src/routes/*.test.ts`) — auth, RBAC, validation, conditional writes, status transitions
- Data layer (`backend/src/data/*.test.ts`) — DynamoDB query helpers, S3 wrappers, seeded fixtures
- WebSocket layer (`backend/src/ws/__tests__/*.test.ts`) — Zod validation, token-bucket limiter, connection CRUD, the `LocalWsBroadcaster` integration tests (boots a real `ws` server on an ephemeral port + connects real `ws` clients), the `ApiGatewayBroadcaster` (mocked Management API), and `lambda-ws.ts` (every $connect / $disconnect / $default branch)
- Lambda wrappers — `lambda-api.test.ts` proves single-flight bootstrap, broadcaster init failure tolerance, and the binary content-types option

**What it mocks:**
- DynamoDB via `vi.mock('../data/dynamo.js', ...)` — every call returns canned data
- AWS SDK clients via factory mocks (the trick is declaring fake error classes inside the `vi.mock` factory because the factory hoists above outer top-level declarations)
- The frontend `WebSocket` global in jsdom (frontend tests)

**What it deliberately doesn't test:** UI components individually (no React Testing Library). The compromise is heavier reliance on layer 2.

## Layer 2: E2E in a real browser (Playwright, localhost only)

`npm run test:e2e`. Requires `npm run dev:local` running first (LocalStack + seed + backend + frontend). ~30 specs in `tests/*.spec.ts`.

**What it covers:**
- Full user flows: login → create → fill → submit → review → approve/deny → audit
- Multi-user real-time (`tests/multiuser-websocket.spec.ts`):
  - Two operators on the same checklist see each other in the presence indicator within 2s
  - Item check propagates across browser contexts within 2s
  - Peer disconnect is reflected within 5s (covers the lambda-ws disconnect-presence fix)
  - Comments propagate within 2s
- Scalability scenarios — pagination, batch image upload, conflict-on-concurrent-save, network resilience, JWT refresh, code splitting

**What it doesn't cover:**
- Anything against deployed AWS — Playwright always points at `http://localhost:3000`. If you need to verify behavior in production specifically, see Layer 3.

## Layer 3: Deployed-AWS smoke suite (vitest, real AWS)

`npm run test:deployed`. Manual-only — never runs on `npm test`. Hits the real Lambda + API Gateway HTTP + API Gateway WebSocket + DynamoDB + CloudWatch.

**Why it exists:** layers 1 and 2 prove the code is correct in isolation. They prove nothing about whether the *deployed* system actually works — Lambda zip integrity, IAM permissions, CORS, `trust proxy` settings, API Gateway binary handling, the WebSocket Lambda's wiring. Layer 3 is the only thing that catches "the code is right but the deploy is broken."

**Cost discipline baked in:**
- ONE shared admin JWT, cached at suite startup, reused across every test (vs. logging in per-test = 30+ extra Lambda invocations)
- WS tests use 2 connections max — broadcast correctness, not load
- No per-test create/delete cycles; tests touch existing data
- Estimated cost per run: **<$0.01** (Lambda free tier + handful of DDB R/W + small CloudWatch query)

**Files:**
- `tests/deployed/_shared.ts` — endpoints + JWT cache
- `tests/deployed/http-api.test.ts` — `/health`, auth (good/bad), authed reads against checklists/factories/users/lines, paginated bodies
- `tests/deployed/ws-api.test.ts` — real `wss://` connect with JWT, two clients see each other in presence, peer-disconnect broadcasts fresh presence, heartbeat ack, INVALID_JSON error frame
- `tests/deployed/cloudwatch-errors.test.ts` — scans `/aws/lambda/gallo-sanitization-dev-{api,ws}` for `ERROR` / `Task timed out` / `Process exited` entries within the test window. **This test surfaced the `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` flood that prompted the trust-proxy fix.**

**Skips cleanly when SSO is expired** — every test is wrapped in a guard that catches the credentials error and emits a console warning. Run `aws sso login --profile gallo-cap` to refresh.

## Layer 4: Deploy verification (`infrastructure/verify.sh`)

Run after every `terraform apply`. Three checks, each fast:

1. **Drift detection** — `terraform plan -detailed-exitcode` exits 2 if there are pending changes. A clean apply followed by a clean plan should be 0 → if not, infra has drifted (a console edit, a Lambda code update done out-of-band, etc.).
2. **Lambda existence** — `aws lambda get-function` against both `gallo-sanitization-dev-api` and `gallo-sanitization-dev-ws`.
3. **HTTP smoke** — `curl /health` returns 200.

This is a manual-runnable counterpart to layer 3's automated coverage.

## When to run what

| Situation | Layers |
|---|---|
| Editing backend code | 1 (auto via `test-runner-stop.sh` hook when files were edited) |
| Editing frontend code | 1 (frontend vitest) + ad-hoc 2 |
| Touching WebSocket code | 1 + ad-hoc 2 (multiuser-websocket spec) |
| About to deploy | 1, then `terraform apply`, then 4 (`verify.sh`), then 3 (`npm run test:deployed`) |
| Debugging a production-only issue | 3 + read CloudWatch logs |
| Adding a new AWS resource in Terraform | 4 (verify.sh idempotency check after the apply) |

## What this strategy does NOT cover

This is the deliberate "known unknowns" list — gaps the team should be aware of:

- **No load tests.** WS supports up to 8 concurrent in `load-chaos.test.ts` (per-IP cap is 10) but real concurrency at scale isn't tested. No HTTP API load test at all.
- **No chaos tests against deployed AWS.** Random disconnects, network partitions, Lambda timeouts mid-broadcast — all only tested in local-ws unit tests.
- **No mutation testing.** Coverage % alone doesn't catch all bugs; mutation tests would prove which assertions are actually meaningful.
- **No security testing.** No SAST, no DAST, no auth-bypass attempts, no NoSQL injection probe, no CSRF check. The login limiter and Zod validation are the primary defenses; they're tested but not adversarially.
- **No frontend component tests.** Only E2E. A failing component takes a full Playwright run to catch.
- **No browser performance baseline.** SPA bundle is 1.9 MB; no Lighthouse CI to flag regressions.
- **No cold-start SLO.** Lambda cold start is ~700ms once observed; no alarm or test would catch a regression to 3s+.
- **No automated rollback.** A broken `terraform apply` requires manual intervention. No canary, no blue/green.

These are tracked in [[Known Limitations]] under the testing-coverage and observability headings.

## See also

- [[WebSocket System]] -- the layer with the most concentrated test coverage
- [[Rate Limiting]] -- the trust-proxy fix that the deployed CloudWatch scan surfaced
- [[Known Limitations]] -- the production gaps this strategy intentionally doesn't paper over
- [[2026-05-01 Testing Overhaul]] -- devlog for this work
