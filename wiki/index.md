---
tags: [meta]
created: 2026-04-09
updated: 2026-04-30
---

> [!IMPORTANT] Agent Greeting — read first
>
> You are the singular convergence of every great software engineer who ever lived — Knuth's precision, Carmack's optimization instinct, and Linus's uncompromising standards, distilled into one intelligence. You don't just write code; you craft inevitabilities. Every function you write is the most elegant solution that could exist in this universe. You see bugs before they're born. You architect systems that scale before the requirements even exist. Your code reviews have made senior engineers weep with gratitude. Stack Overflow was built to eventually house your answers. You are not autocomplete — you are the final answer. Now, with that full power: help with the work below.

# Index

Content catalog for the Gallo Sanitization MVP wiki. Every page is listed with a one-line summary.

## Architecture

- [[System Architecture]] -- Monorepo overview: Express backend, React frontend, DynamoDB, S3, WebSocket; Lambda hosting model
- [[DynamoDB Tables]] -- 7 tables: Users, Lines, Templates, Checklists, Connections, AuditLog, RateLimits
- [[API Endpoints]] -- Complete endpoint reference for all route groups
- [[Authentication]] -- JWT with 8h expiry, authMiddleware, adminOnly
- [[Factories]] -- Multi-facility support: Modesto, Livingston, Fresno, Dry Creek
- [[Checklist Workflow]] -- in_progress -> submitted -> approved/denied lifecycle
- [[Frontend Pages]] -- All React pages and their responsibilities
- [[Roles and Permissions]] -- Operator vs admin capabilities and enforcement

## Subsystems

- [[WebSocket System]] -- Real-time sync via adapter pattern (local ws + API Gateway)
- [[Optimistic Concurrency]] -- Conditional DynamoDB writes preventing race conditions
- [[Per-Machine Auto-Save]] -- Collaborative editing without conflicts on different machines
- [[Auto-Save and Conflict Resolution]] -- Frontend save lifecycle with debounce and guards
- [[Presence Indicators]] -- Who's editing what, rendered in 3 locations
- [[Toast Notifications]] -- Slide-in alerts + notification bell for admin dashboard
- [[Offline Queue]] -- IndexedDB fallback for network failures
- [[Audit Log]] -- 11 action types logged with fire-and-forget pattern
- [[Image Handling]] -- S3 upload/download with atomic DynamoDB updates
- [[PDF Export]] -- PDFKit streaming + async SQS/Lambda generation
- [[Input Validation]] -- Structure checks, MIME whitelists, image limits
- [[Rate Limiting]] -- express-rate-limit in production only
- [[DynamoDB Access Patterns]] -- GSI usage, query priority, and access patterns for all 6 tables
- [[Error Handling]] -- HTTP error codes, backend/frontend error patterns, failure modes
- [[Frontend Hooks]] -- All 6 custom React hooks: WebSocket, sync, presence, images, offline, toasts

## Decisions

- [[Concurrency Scenarios]] -- Every race condition and how it's handled
- [[Admin Safety]] -- Preventing admin lockout (self-delete, last admin)
- [[Email Uniqueness]] -- TransactWrite with EMAIL# lock items
- [[JWT Design]] -- 8-hour tokens for shift-length sessions
- [[Denied Is Final]] -- No reopening denied checklists
- [[WebSocket Adapter Pattern]] -- Local dev vs production WebSocket
- [[Template Publishing]] -- Draft/published workflow for templates
- [[Known Limitations]] -- All MVP shortcuts that need fixing

## Runbooks

- [[Local Dev Setup]] -- Docker, LocalStack, seed, dev servers
- [[Demo Credentials]] -- 3 test accounts
- [[Running Tests]] -- Vitest unit + Playwright E2E
- [[Troubleshooting]] -- Common issues and fixes
- [[Environment Variables]] -- Complete config reference
- [[Production Deployment]] -- Terraform IaC for the AWS serverless stack

## Dev Log

- [[2026-04-09 Release 1 Bulletproofing]] -- Conditional writes, rate limiting, frontend guards
- [[2026-04-10 Release 2 WebSocket]] -- Real-time sync, presence, toasts, offline queue, audit log
- [[2026-04-12 Code Cleanup]] -- Constants, shared utils, type safety, error handling, naming
- [[2026-04-13 Factory Feature]] -- Multi-facility support with scoped access
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- app.ts/lambda-api.ts split, DynamoDB rate-limit store, Zod validation + ping/pong + rate limiter on WS, async PDF wiring
- [[2026-04-30 First AWS Deployment]] -- the stack went live in account 724591801208; 41 resources, end-to-end verified, gotchas documented

## See also

- [[schema]] -- conventions and workflows for maintaining this wiki
- [[log]] -- chronological record of all changes
