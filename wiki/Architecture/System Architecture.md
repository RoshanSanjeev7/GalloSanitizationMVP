---
tags: [architecture]
created: 2026-04-09
updated: 2026-05-01
---

# System Architecture

The Gallo Sanitization MVP is a monorepo with two workspaces: `backend/` (Node.js + Express + TypeScript) and `frontend/` (React 18 + Vite + TypeScript). They communicate exclusively over HTTP and WebSocket -- no shared code at the module level.

## Runtime Topology

```
Browser (:3000)                      Backend (:4000)
  React SPA  ──── HTTP REST ──────>  Express
  wsClient   ──── WebSocket ──────>  LocalWsBroadcaster / ApiGatewayBroadcaster
                                       |
                                       |── DynamoDB (8 tables)
                                       +── S3 (checklist-images bucket)
```

PDF generation runs **client-side** (jsPDF in the browser) — no server round-trip. See [[PDF Export]].

Vite's dev server proxies `/api` requests to port 4000, so the frontend never talks to the backend directly by port in development. In production the backend serves the built frontend assets or sits behind a reverse proxy.

## Backend

Express handles all HTTP routing, organized into route files by resource: `auth.ts`, `users.ts`, `lines.ts`, `templates.ts`, `checklists.ts`, `images.ts`, and `audit.ts`. Every route file applies `authMiddleware` (JWT verification), and write operations on admin-only resources additionally use `adminOnly`. See [[Authentication]] for how these middleware functions work.

The Express app is constructed in `backend/src/app.ts` via a pure `createApp()` factory — no `.listen()`, no seed, no broadcaster init. Two entry points consume the factory:
- **`backend/src/index.ts`** -- long-lived dev server. Calls `seedIfEmpty()`, `app.listen()`, and `LocalWsBroadcaster.init(server)`. This is what `npm run dev` runs.
- **`backend/src/lambda-api.ts`** -- AWS Lambda handler wrapping the same app via `serverless-http`. Caches the bootstrapped handler across warm invocations; instantiates `ApiGatewayBroadcaster` instead of the local one.

This split means the same Express routes run unchanged in both modes — see [[2026-04-30 Lambda Readiness and WS Hardening]] for the rationale.

The data layer lives in `backend/src/data/dynamo.ts`, a single file containing every database operation -- gets, puts, scans, queries, conditional writes, and transactional writes. It talks to [[DynamoDB Tables]] through table names loaded from `config.tables.*`, which default to the `Sanitization*` naming convention but are overridable via [[Environment Variables]].

PDF generation runs entirely in the browser via jsPDF — no server-side route, no SQS, no S3 cache. See [[PDF Export]] and [[2026-04-30 PDF Simplification]] for why this used to be server-side and what was removed.

The [[WebSocket System]] is initialized at server startup. `createBroadcaster(config.wsMode)` dynamically imports either `LocalWsBroadcaster` (which creates a `ws` WebSocketServer attached to the HTTP server) or `ApiGatewayBroadcaster` (which posts messages to AWS API Gateway Management API). The broadcaster instance is stored on `app` via `app.set('broadcaster', broadcaster)` and retrieved in route handlers with `req.app.get('broadcaster')`.

## Frontend

The React app uses React Router v6 with a flat route structure defined in `App.tsx`. Admin-only pages (`AdminDashboard`, `SubmissionReview`, `CreateTemplate`, `RoleAssignment`, `AuditLog`) are lazy-loaded via `React.lazy()` for code splitting. All routes are wrapped in `ProtectedRoute`, which checks Redux auth state and redirects to `/login` if no user is found.

State management is minimal -- Redux Toolkit stores only auth state (`authSlice`). Everything else is local component state fetched from the [[API Endpoints]] via the `api` service module. The `api.ts` service auto-injects the JWT token from localStorage, handles 401 responses by clearing auth and redirecting, and proactively refreshes tokens 30 minutes before expiry.

A `WebSocketProvider` wraps the entire app, establishing the WebSocket connection on login and showing a `ReconnectBanner` when the connection drops. The `OfflineBanner` component listens for `navigator.onLine` changes.

## Infrastructure (Local Dev)

LocalStack runs in Docker and emulates DynamoDB, S3, and SQS. The `docker-compose.yml` mounts `localstack/init-aws.sh`, which creates all seven DynamoDB tables (six core + `SanitizationRateLimits`) and the S3 bucket on container start. After LocalStack is healthy, `npm run localstack:seed` runs the seed script to populate demo data (users, lines, templates). See [[Local Dev Setup]] for the full procedure.

## Hosting Model (LIVE as of 2026-04-30)

Deployed to AWS account `724591801208` — see [[2026-04-30 First AWS Deployment]]. Fully serverless, scales to zero between users. Currently live URLs in [[Production Deployment]]:

```
Browser → S3 website (frontend assets, static)
                    ↘ API Gateway HTTP API → Lambda (lambda-api.ts wrapping Express)
                                              ↓
                                   DynamoDB · S3 (images) · CloudWatch
                    ↘ API Gateway WebSocket → Lambda (lambda-ws.ts; $connect/$disconnect/$default)
                                                         ↓
                                              DynamoDB SanitizationConnections
```

**WebSocket is now live in production** (provisioned 2026-05-01). The API Lambda fans real-time updates back to subscribed clients via API Gateway's Management API (`PostToConnection`); permission granted by `aws_iam_role_policy.lambda_api_ws_post`. WS endpoint: `wss://<api-id>.execute-api.us-west-2.amazonaws.com/prod`. See [[WebSocket System]] for the full event-by-event handler design.

PDF generation runs in the browser; no PDF Lambda, no SQS queue, no S3 cache.

Cost expectation at MVP traffic: <$5/month. At a single facility (~100 users): ~$20-40/month. Crossover with always-on Fargate (~$30-80/month flat) is around 1M sustained req/day, so serverless wins at MVP-to-mid scale and Fargate becomes preferable only at sustained heavy load.

Cold-start mitigation: ARM (Graviton2) Lambda, esbuild bundling with tree-shaken `@aws-sdk` imports, provisioned concurrency for the API Lambda during business hours. Image upload bypasses Lambda entirely via presigned S3 URLs (planned). PDF generation is its own Lambda kept separate from the API Lambda so PDFKit doesn't bloat login-route cold starts.

See [[2026-04-30 Lambda Readiness and WS Hardening]] for the foundational changes that enable this topology.

## See also

- [[DynamoDB Tables]] -- the database schema backing everything above
- [[WebSocket System]] -- how real-time messaging works
- [[Authentication]] -- JWT verification and middleware chain
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- devlog for the Lambda-readiness foundation
