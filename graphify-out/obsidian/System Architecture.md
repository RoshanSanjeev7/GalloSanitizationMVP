---
tags:
  - architecture
---

# System Architecture

The Gallo Sanitization MVP is a monorepo with two workspaces: `backend/` (Node.js + Express + TypeScript) and `frontend/` (React 18 + Vite + TypeScript). They share no code at the module level, communicating exclusively over HTTP and WebSocket.

## Runtime Topology

```
Browser (:3000)                      Backend (:4000)
  React SPA  ──── HTTP REST ──────►  Express
  wsClient   ──── WebSocket ──────►  LocalWsBroadcaster / ApiGatewayBroadcaster
                                       │
                                       ├── DynamoDB (6 tables)
                                       ├── S3 (checklist-images bucket)
                                       └── SQS (pdf-generation-queue)
```

Vite's dev server proxies `/api` requests to port 4000, so the frontend never talks to the backend directly by port in development. In production the backend serves the built frontend assets or sits behind a reverse proxy.

## Backend

Express handles all HTTP routing, organized into route files by resource: `auth.ts`, `users.ts`, `lines.ts`, `templates.ts`, `checklists.ts`, `images.ts`, and `audit.ts`. Every route file applies `authMiddleware` (JWT verification), and write operations on admin-only resources additionally use `adminOnly`. See [[Authentication]] for how these middleware functions work.

The data layer lives in `backend/src/data/dynamo.ts`, which wraps the AWS SDK v3 `DynamoDBDocumentClient`. This single file contains every database operation -- gets, puts, scans, queries, conditional writes, and transactional writes. It talks to [[DynamoDB Tables]] through table names loaded from `config.tables.*`, which default to the `Sanitization*` naming convention but are overridable via environment variables.

SQS is used for asynchronous PDF generation: when a checklist is submitted, a message is sent to `pdf-generation-queue`, which triggers a Lambda function (`lambda-pdf.ts`) to generate and cache the PDF in S3. See [[PDF Export]] for the full synchronous and asynchronous generation flow.

The [[WebSocket System]] is initialized at server startup. `createBroadcaster(config.wsMode)` dynamically imports either `LocalWsBroadcaster` (which creates a `ws` WebSocketServer attached to the HTTP server) or `ApiGatewayBroadcaster` (which posts messages to AWS API Gateway Management API). The broadcaster instance is stored on `app` via `app.set('broadcaster', broadcaster)` and retrieved in route handlers with `req.app.get('broadcaster')`.

## Frontend

The React app uses React Router v6 with a flat route structure defined in `App.tsx`. Admin-only pages (`AdminDashboard`, `SubmissionReview`, `CreateTemplate`, `RoleAssignment`, `AuditLog`) are lazy-loaded via `React.lazy()` for code splitting. All routes are wrapped in `ProtectedRoute`, which checks Redux auth state and redirects to `/login` if no user is found.

State management is minimal -- Redux Toolkit stores only auth state (`authSlice`). Everything else is local component state fetched from the [[API Endpoints]] via the `api` service module. The `api.ts` service auto-injects the JWT token from localStorage, handles 401 responses by clearing auth and redirecting, and proactively refreshes tokens 30 minutes before expiry.

A `WebSocketProvider` wraps the entire app, establishing the WebSocket connection on login and showing a `ReconnectBanner` when the connection drops. The `OfflineBanner` component listens for `navigator.onLine` changes.

## Infrastructure (Local Dev)

LocalStack runs in Docker and emulates DynamoDB, S3, and SQS. The `docker-compose.yml` mounts `localstack/init-aws.sh`, which creates all six DynamoDB tables and the S3 bucket on container start. After LocalStack is healthy, `npm run localstack:seed` runs the seed script to populate demo data (users, lines, templates). See [[Local Dev Setup]] for the full procedure.

## See also

- [[DynamoDB Tables]] -- the database schema backing everything above
- [[WebSocket System]] -- how real-time messaging works
- [[Authentication]] -- JWT verification and middleware chain
