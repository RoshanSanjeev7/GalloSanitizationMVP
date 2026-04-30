---
tags: [architecture]
created: 2026-04-09
updated: 2026-04-30
---

# DynamoDB Tables

The application uses seven DynamoDB tables, all created by `localstack/init-aws.sh` on container startup. Table names are configurable via [[Environment Variables]] but default to the `Sanitization*` prefix.

## SanitizationUsers

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` (PK) | String | UUID for real users, `EMAIL#<email>` for lock items |
| `name` | String | Display name |
| `email` | String | Login email |
| `password` | String | Plaintext in dev (needs bcrypt for production) |
| `role` | String | `operator` or `admin` |
| `factoryIds` | List | Array of factory IDs the user is assigned to |

**GSI:** `email-index` (partition key: `email`)

This table holds both real user records and synthetic `EMAIL#<email>` lock items that enforce [[Email Uniqueness]]. The lock items share the same `email` GSI value as the real user, so `getUserByEmail` explicitly filters out items where `id.startsWith('EMAIL#')`. `getAllUsers` does the same filtering.

## SanitizationLines

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` (PK) | String | UUID |
| `name` | String | e.g., "Line 1 - Red Wine Bottling" |
| `factoryId` | String | Which factory this line belongs to |

No GSIs. Read with `ScanCommand` since the number of lines is small (single-digit).

## SanitizationTemplates

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` (PK) | String | UUID |
| `title` | String | Template name |
| `lineId` | String | Which production line this template is for |
| `machines` | List | Array of `{ name, categories: [{ name, tasks: [{ description, machine }] }] }` |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |
| `published` | Boolean | Whether operators can see this template (see [[Template Publishing]]) |

**GSI:** `lineId-index` (partition key: `lineId`)

When an operator creates a checklist for a line, the backend queries `lineId-index` to find the template. The `machines` array defines the structure that gets cloned into the new checklist.

## SanitizationChecklists

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` (PK) | String | UUID |
| `templateId` | String | Source template |
| `lineId` | String | Production line |
| `lineName` | String | Denormalized for display |
| `operatorId` | String | Who created it |
| `operatorName` | String | Denormalized for display |
| `factoryId` | String | Denormalized from line for factory scoping |
| `status` | String | `in_progress`, `submitted`, `approved`, `denied` |
| `version` | Number | Incremented on every write -- see [[Optimistic Concurrency]] |
| `startTime` | String | ISO timestamp |
| `endTime` | String | Set on submit |
| `submittedAt` | String | Set on submit |
| `updatedAt` | String | Set on every item update |
| `viewedAt` | String | When an admin first opened this checklist |
| `viewedBy` | String | Which admin viewed it |
| `activities` | List | Timeline of comments, images, submits |
| `machines` | List | Deep nested array: machines > categories > items |

**GSIs:**
- `operatorId-index` (partition: `operatorId`) -- operator dashboard queries
- `status-index` (partition: `status`) -- admin dashboard queries by status
- `lineId-status-index` (partition: `lineId`, sort: `status`) -- filtering by line and status

The `version` field is the backbone of [[Optimistic Concurrency]]. Every conditional write checks it, and every successful write increments it. The `machines` array is the actual checklist data -- each item has `completed`, `completedBy`, `completedAt`, `issue`, and `images` fields. The [[Per-Machine Auto-Save]] endpoint uses `UpdateCommand SET machines[N]` to write a single machine without touching the rest.

The `activities` array is a timeline of events on the checklist. Each entry has `type` ('comment' | 'image' | 'submit' | 'created'), `by` (user name), `at` (ISO timestamp), and optional `detail` (comment text or image count). Activities are rendered in the admin notification dropdown and the SubmissionReview sidebar.

The `viewedAt` and `viewedBy` fields track when an admin last viewed the checklist. These reset to null whenever an operator adds a comment or image, so the admin sees new activity. The `queryChecklists` function picks the most selective GSI based on which filters are provided.

## SanitizationConnections

| Attribute | Type | Notes |
|-----------|------|-------|
| `connectionId` (PK) | String | `local-N` or API Gateway connection ID |
| `userId` | String | Who owns this connection |
| `userName` | String | For presence display |
| `userRole` | String | `operator` or `admin` |
| `checklistId` | String | Which checklist they're subscribed to (null if on dashboard) |
| `activeMachine` | Number | Which machine tab they have open |
| `channel` | String | `dashboard` or `checklist` |
| `connectedAt` | String | ISO timestamp |
| `lastActivity` | String | Updated on heartbeat |
| `ttl` | Number | DynamoDB TTL -- auto-deletes stale connections |

**GSI:** `checklistId-index` (partition: `checklistId`)

This table backs the [[WebSocket System]]. Each WebSocket connection gets a record here. The `checklistId-index` GSI enables fast lookups for presence queries ("who's editing checklist X?"). The TTL field ensures abandoned connections get cleaned up automatically.

## SanitizationAuditLog

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` (PK) | String | UUID |
| `userId` | String | Who performed the action |
| `userName` | String | Display name |
| `userRole` | String | Role at time of action |
| `action` | String | e.g., `checklist_submitted`, `user_created` |
| `targetType` | String | `checklist`, `user`, `template` |
| `targetId` | String | ID of the affected entity |
| `detail` | String | Human-readable description |
| `timestamp` | String | ISO timestamp |

**GSIs:**
- `userId-index` (partition: `userId`, sort: `timestamp`) -- filter by who did it
- `timestamp-index` (partition: `action`, sort: `timestamp`) -- filter by action type

See [[Audit Log]] for what gets logged and how the frontend displays it.

## SanitizationRateLimits

| Attribute | Type | Notes |
|-----------|------|-------|
| `pk` (PK) | String | Rate-limit key, prefixed `rl:` (e.g. `rl:ip:1.2.3.4`) |
| `count` | Number | Hits accumulated in the current window |
| `resetAt` | Number | Epoch ms when the current window expires |
| `ttl` | Number | Epoch seconds — DynamoDB auto-evicts expired counters |

No GSIs. Used by `backend/src/middleware/rate-limit-store.ts` as the `Store` for `express-rate-limit` in production. See [[Rate Limiting]] for why this replaced the default in-memory store and how the atomic conditional UpdateItem works.

## See also

- [[Optimistic Concurrency]] -- why the Checklists table needs a version field
- [[Email Uniqueness]] -- why Users has EMAIL# lock items
- [[WebSocket System]] -- what the Connections table tracks
- [[Rate Limiting]] -- the RateLimits table backing express-rate-limit
- [[DynamoDB Access Patterns]] -- which GSIs are used for what and query priority
