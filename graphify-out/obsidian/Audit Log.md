---
tags:
  - backend
  - frontend
---

# Audit Log

The audit log records every significant action in the system, providing a tamper-resistant trail for compliance and debugging.

## What Gets Logged

| Action | Target | When |
|--------|--------|------|
| `checklist_created` | checklist | Operator creates a new checklist |
| `checklist_submitted` | checklist | Operator submits for review |
| `checklist_approved` | checklist | Admin approves |
| `checklist_denied` | checklist | Admin denies |
| `checklist_deleted` | checklist | Admin deletes |
| `user_created` | user | Admin creates a new user account |
| `user_role_changed` | user | Admin changes a user's role |
| `user_deleted` | user | Admin deletes a user account |
| `template_created` | template | Admin creates a checklist template |
| `template_updated` | template | Admin modifies a template |
| `template_deleted` | template | Admin deletes a template |

Each entry includes: who performed the action (`userId`, `userName`, `userRole`), what they did (`action`, `targetType`, `targetId`), a human-readable `detail` string, and a `timestamp`.

## Backend Implementation

The `logAudit()` function in `backend/src/data/audit.ts` takes an entry (minus `id` and `timestamp`, which it generates) and writes it to the `SanitizationAuditLog` table in [[DynamoDB Tables]].

All audit calls in route handlers are **fire-and-forget**: `logAudit({...}).catch(() => {})`. This means audit logging never blocks or fails the primary operation. If DynamoDB is temporarily unreachable, the audit entry is silently dropped rather than causing the user's action to fail.

The `getAuditLogs()` function supports filtering by `userId` (via `userId-index` GSI), by `action` (via `timestamp-index` GSI), and by date range. When no specific filter is provided, it falls back to a full scan sorted by timestamp descending.

## API Endpoint

`GET /api/audit` is admin-only (requires both `authMiddleware` and `adminOnly`). See [[API Endpoints]] for the full endpoint table. It accepts query parameters: `userId`, `action`, `startDate`, `endDate`, `limit`, `offset`.

## Frontend

The AuditLog page (`/settings/audit`) is accessible from the Settings page, admin-only. It renders a filterable table with:

- **User filter** -- dropdown of all users
- **Action filter** -- dropdown of action types
- **Date range** -- start and end date pickers
- **Results table** -- timestamp, user name, action badge (color-coded), target, detail

Action badges use semantic colors: green for creates, blue for role changes, red for deletes, yellow for denials, gray for submissions. Pagination follows the standard `limit`/`offset` pattern.

The page is lazy-loaded (`React.lazy`) since only admins access it. See [[Roles and Permissions]] for access control and [[Frontend Pages]] for how it fits into the app's page structure.

## See also

- [[API Endpoints]] -- the audit GET endpoint
- [[DynamoDB Tables]] -- the AuditLog table schema and GSIs
- [[Roles and Permissions]] -- admin-only access to audit data
