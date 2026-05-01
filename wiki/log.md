---
tags: [meta]
created: 2026-04-09
updated: 2026-05-01
---

# Log

Chronological record of all wiki changes. Newest entries at the top.

## [2026-05-01] test+infra | Production WebSocket + four-layer testing strategy

Three large pieces shipped in one session. (1) API Gateway WebSocket provisioned in production: `lambda-ws.ts` handler + `infrastructure/websocket.tf` (12 resources) + IAM permissions for the API Lambda to PostToConnection. Real-time presence + item updates now work against the deployed `wss://...amazonaws.com/prod` URL — the half-finished bit from the first AWS deploy is now done. (2) Comprehensive testing overhaul: pruned 5 obsolete tests (SQS mocks + scalability-pdf.spec.ts), added 29 new unit tests covering `lambda-ws`, `lambda-api`, and `apigw-ws`, added 4 real-time E2E assertions, added a deployed-AWS smoke suite (15 tests against real Lambda + API Gateway + DynamoDB + CloudWatch via `npm run test:deployed`, ~$0.01/run), added `infrastructure/verify.sh` for post-deploy drift detection. (3) Two production bugs surfaced and fixed by the new tests: the `lambda-ws` `$disconnect` deferred presence-leave (peers vanished only on next event from anyone), and an `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` flood from a missing Express `trust proxy` setting (caught by the deployed CloudWatch error scan on its first run). New page [[Testing Strategy]]; new devlog [[2026-05-01 Testing Overhaul]]; updated [[WebSocket System]], [[Rate Limiting]], [[System Architecture]], [[Known Limitations]] (closed 3 items, added 6 new ones spanning lambda-ws hardening, deployed load testing, automated rollback, CI pipeline, CloudFront/HTTPS, alarms, dependency updates).

## [2026-04-30] feature | Operators constrained to a single factory

Operators must now belong to exactly one factory; admins can still span multiple. Backend `PUT /api/users/:id` rejects with HTTP 400 if the post-update state has `role==='operator'` and `factoryIds.length !== 1`. Validation also catches admin→operator demotions when the existing factoryIds is multi (admin must trim first). Frontend RoleAssignment renders the factory selector as radios for operators (single-select, replace-on-click) and checkboxes for admins. Seed data adjusted: Gabriel Sanchez → Modesto only, Marcus Rivera → Fresno only. The "operators see all in-progress at their factory" half of the request was already shipped — `GET /api/checklists` only post-filters by the user's `factoryIds`, never by `operatorId`, and there's no ownership guard on PUT items / submit. Updated [[Factories]]. 5 new tests in `users.test.ts` (suite at 238/238).

## [2026-04-30] simplify | PDF moved client-side; server stack ripped out

After the first AWS deploy surfaced two PDF problems — blank downloads (API Gateway corrupting binary bytes as UTF-8) and silent spam-click failures (rate limiter returning 429s the UI swallowed) — moved PDF generation entirely into the browser via jsPDF. Deleted: `/pdf` route + handler (~250 lines), `/pdf/status` route, `lambda-pdf.ts`, `sqs.ts`, `pdf-generator.ts`, `pdfkit` dep, `pdfLimiter`, SQS queue + DLQ, PDF Lambda, IAM role, S3 PDFs bucket, DLQ alarm, `enable_async_pdf` variable, `.afm` font-copy step. Lambda zip dropped 2.4 MB → 1.4 MB. Added `frontend/src/utils/pdf.ts` (jsPDF-based generator that mirrors the previous layout exactly). Net: zero server CPU on PDF, no rate limiting needed, sub-100ms generation. See [[2026-04-30 PDF Simplification]] for the full story.

## [2026-04-30] deploy | First AWS deployment LIVE

The Terraform stack went live in account `724591801208` (`aws-cse120-capstone-01r`, UC Merced capstone). API Gateway + Lambda + DynamoDB + S3 SPA + SQS + CloudWatch alarms — 41 resources. Verified end-to-end: `/health` responds, admin login returns a valid JWT, authenticated `/api/checklists` paginates the 56 seeded items, all 4 factories listed. SPA hosted on raw S3 website endpoint at `gallo-sanitization-dev-frontend-724591801208.s3-website-us-west-2.amazonaws.com`. AWS Budget set to $50/mo with email at 50% / 100%. Three deploy-time fixes (AWS_REGION reserved, S3 lifecycle filter, render-helpers TS cast) committed in `5a16a3b`. Two operational gotchas documented in [[Production Deployment]] (LOCALSTACK_ENDPOINT="" for seed, scan --select COUNT for verification). Full devlog at [[2026-04-30 First AWS Deployment]]. Real-time WS still off (API Gateway WebSocket not yet provisioned); everything else functional.

## [2026-04-30] feature | Production Terraform infrastructure

Added `infrastructure/` directory with Terraform IaC for the AWS serverless stack: 8 DynamoDB tables (matching the local-dev schema), 3 S3 buckets (frontend, images, PDFs with 90-day lifecycle), SQS queue + DLQ, 2 Lambdas (api + pdf) on ARM64 with esbuild bundling, API Gateway HTTP API, per-Lambda IAM roles with least privilege, CloudWatch alarms on DLQ depth and Lambda errors. Added [[Production Deployment]] runbook. WebSocket API Gateway, CloudFront, Route 53, and WAF are documented as follow-ups.

## [2026-04-30] feature | Lambda readiness + WS hardening

Added [[2026-04-30 Lambda Readiness and WS Hardening]] devlog entry. Updated [[WebSocket System]] with validation, ping/pong, JWT recheck, origin allowlist, per-IP cap, rate limiter, graceful shutdown, and `WsDebugPanel` sections. Updated [[Rate Limiting]] with the DynamoDB-backed Store and the WS rate limiter pointer. Updated [[PDF Export]] — async path is now wired (SQS publish + Lambda idempotency + presigned-URL status endpoint + frontend status-poll). Updated [[System Architecture]] with the `app.ts` / `lambda-api.ts` split and the production Lambda topology. Added `SanitizationRateLimits` to [[DynamoDB Tables]] (now 7 tables). [[Known Limitations]]: closed in-memory rate limiter, presence ghost users, no WS message validation, no per-WS rate limiting; partially mitigated single-process WebSocket.

## [2026-04-14] lint | Fixed contradictions and added solution designs

Fixed admin scoping contradiction in Roles page. Marked ProtectedAdminRoute as resolved.
Added demo user factory assignments. Added hierarchy diagram to Factories.
Added recommended fix designs for P0/P1 Known Limitations.

## [2026-04-13] lint | Wiki gaps filled from audit

Added: API payload examples, DynamoDB Access Patterns page, Error Handling page, Frontend Hooks page, factory cascade docs, Known Limitations prioritization.

## [2026-04-13] rebuild | Wiki rebuilt from scratch using LLM knowledge base pattern

Migrated from graphify-out/obsidian/ to wiki/. Added [[index]], [[log]], [[schema]]. Restructured into Architecture/, Subsystems/, Decisions/, Runbooks/, DevLog/ folders. 37 content pages with consistent frontmatter, embedded backlinks, and See also sections.

## [2026-04-13] feature | Factory feature

Added [[Factories]] page documenting multi-facility support. Updated [[DynamoDB Tables]], [[Checklist Workflow]], [[API Endpoints]], [[Roles and Permissions]] with factory scoping details. Created [[2026-04-13 Factory Feature]] devlog entry.

## [2026-04-12] refactor | Code cleanup

Extracted constants, shared utilities (MachineSelector, formatDate/Time, getBroadcaster). Fixed type safety, added ErrorBoundary, naming cleanup. Created [[2026-04-12 Code Cleanup]] devlog entry.

## [2026-04-10] feature | Release 2 real-time

Added [[WebSocket System]], [[Presence Indicators]], [[Toast Notifications]], [[Offline Queue]], [[Audit Log]], [[Template Publishing]], [[WebSocket Adapter Pattern]]. Created [[2026-04-10 Release 2 WebSocket]] devlog entry.

## [2026-04-09] feature | Release 1 bulletproofing

Added [[Optimistic Concurrency]], [[Per-Machine Auto-Save]], [[Rate Limiting]], [[Input Validation]], [[Admin Safety]], [[JWT Design]], [[Email Uniqueness]]. Created [[2026-04-09 Release 1 Bulletproofing]] devlog entry.

## See also

- [[index]] -- content catalog
- [[schema]] -- conventions governing this log
