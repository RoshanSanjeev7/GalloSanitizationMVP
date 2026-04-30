---
tags: [meta]
created: 2026-04-09
updated: 2026-04-30
---

# Log

Chronological record of all wiki changes. Newest entries at the top.

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
