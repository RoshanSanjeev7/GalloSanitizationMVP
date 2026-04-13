---
tags:
  - backend
---

# API Endpoints

All endpoints are prefixed with `/api`. Every endpoint except `POST /api/auth/login` requires a valid JWT (see [[Authentication]]). Admin-only endpoints additionally require `role: 'admin'` in the token.

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | None | Validate credentials, return JWT + user |
| POST | `/auth/refresh` | JWT | Issue a fresh 8h token |
| GET | `/auth/me` | JWT | Return current user's profile |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | JWT | List all users (paginated, max 100) |
| POST | `/users` | Admin | Create user with [[Email Uniqueness]] transaction |
| PUT | `/users/:id` | Admin | Update role (with [[Admin Safety]] checks) |
| DELETE | `/users/:id` | Admin | Delete user + email lock (with self-delete and last-admin guards) |

## Lines

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/lines` | JWT | List all production lines |
| POST | `/lines` | Admin | Create a new production line |

## Templates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/templates` | JWT | List all templates |
| GET | `/templates/:id` | JWT | Get a single template |
| POST | `/templates` | Admin | Create template |
| PUT | `/templates/:id` | Admin | Update template |
| DELETE | `/templates/:id` | Admin | Delete template |
| POST | `/templates/:id/publish` | Admin | Publish or unpublish template (body: `{ published: boolean }`) |

## Checklists

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/checklists` | JWT | List checklists (filterable by status, operatorId, lineId, search, date; paginated) |
| GET | `/checklists/notifications` | Admin | Submitted + in-progress checklists for admin notification bell |
| POST | `/checklists/mark-all-viewed` | Admin | Atomically mark all submitted + in_progress checklists as viewed (batched, max 500) |
| GET | `/checklists/:id` | JWT | Get single checklist (auto-marks viewed for admin) |
| POST | `/checklists` | JWT | Create checklist from line's template (409 if in-progress exists for line) |
| PUT | `/checklists/:id/items` | JWT | Update all machines (uses [[Optimistic Concurrency]] via `conditionalPutChecklist`) |
| PUT | `/checklists/:id/machines/:machineIdx` | JWT | Update single machine (uses [[Per-Machine Auto-Save]] via `updateChecklistMachine`) |
| POST | `/checklists/:id/submit` | JWT | Submit (conditional on `in_progress` + version) |
| POST | `/checklists/:id/approve` | Admin | Approve (conditional on `submitted` + version) |
| POST | `/checklists/:id/deny` | Admin | Deny (conditional on `submitted` + version) |
| DELETE | `/checklists/:id` | Admin | Delete (conditional on existence) |
| GET | `/checklists/:id/pdf/status` | Admin | Check if cached PDF is available |
| GET | `/checklists/:id/pdf` | Admin | Generate and stream PDF report |

The submit, approve, and deny endpoints all use `conditionalStatusTransition` which checks both the expected status and version. This is described in detail in [[Optimistic Concurrency]].

## Images

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checklists/:id/images` | JWT | Upload images (multipart, max 10 files, 10MB each) |
| POST | `/checklists/:id/image-urls` | JWT | Batch get presigned S3 URLs (max 50) |
| GET | `/checklists/:id/images/*` | JWT | Get single presigned URL |
| DELETE | `/checklists/:id/images` | JWT | Delete image from S3 and DynamoDB |

Image uploads go through [[Input Validation]] for MIME type checking and count limits. See [[Image Handling]] for the full upload/retrieval/delete lifecycle.

## Audit

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit` | Admin | Query audit log (filterable by userId, action, date range; paginated) |

## Common Patterns

**Pagination:** All list endpoints accept `limit` (capped at 100) and `offset` parameters, returning `{ items, total, hasMore }`.

**Error responses:** Consistent `{ error: "message" }` shape. 409 for concurrency conflicts (see [[Concurrency Scenarios]]), 403 for insufficient role, 400 for validation failures, 404 for missing resources.

**[[Input Validation]]:** Checklist item updates run through `validateMachines()` which recursively checks the machines/categories/items structure. Image endpoints validate MIME types and enforce per-item (20) and per-checklist (200) limits.

## See also

- [[Authentication]] -- how auth headers are verified
- [[Checklist Workflow]] -- the business logic behind the checklist endpoints
- [[Rate Limiting]] -- which endpoints have specific rate limits
