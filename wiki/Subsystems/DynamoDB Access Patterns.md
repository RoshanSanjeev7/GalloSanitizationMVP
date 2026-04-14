---
tags: [subsystem, database]
created: 2026-04-13
updated: 2026-04-13
---

# DynamoDB Access Patterns

This page documents every Global Secondary Index (GSI) in the application, which functions use them, and the query priority strategy for multi-filter lookups. For table schemas, see [[DynamoDB Tables]]. For the endpoints that trigger these queries, see [[API Endpoints]].

## SanitizationUsers

### email-index

- **Partition key:** `email`
- **Used by:** `getUserByEmail(email)` in `data/dynamo.ts`
- **Purpose:** Login lookup. Given an email address, find the matching user record.
- **Callers:** `POST /api/auth/login`, `POST /api/users` (duplicate check)
- **Nuance:** The email GSI returns both real user records and synthetic `EMAIL#<email>` lock items (used for [[Email Uniqueness]]). `getUserByEmail` queries with `Limit: 5` and then filters out items where `id.startsWith('EMAIL#')` to find the actual user. `getAllUsers` does the same filtering on a full table scan.

## SanitizationTemplates

### lineId-index

- **Partition key:** `lineId`
- **Used by:** `getTemplatesByLineId(lineId)` in `data/dynamo.ts`
- **Purpose:** Find all templates assigned to a specific production line.
- **Callers:** `POST /api/checklists` (to clone the published template into a new checklist)
- **Nuance:** The result is filtered by `published !== false` for operators, but admins can use any template. See [[Template Publishing]].

## SanitizationChecklists

### operatorId-index

- **Partition key:** `operatorId`
- **Sort key:** `startTime` (descending via `ScanIndexForward: false`)
- **Used by:** `getChecklistsByOperator(operatorId)` in `data/dynamo.ts`
- **Purpose:** Fetch all checklists created by a specific operator, newest first.
- **Callers:** `queryChecklists()` when `operatorId` filter is provided; powers the operator dashboard.

### status-index

- **Partition key:** `status`
- **Sort key:** `startTime` (descending via `ScanIndexForward: false`)
- **Used by:** `getChecklistsByStatus(status)` in `data/dynamo.ts`
- **Purpose:** Fetch all checklists with a given status (e.g., `submitted`, `in_progress`), newest first.
- **Callers:** `queryChecklists()` when `status` filter is provided without `operatorId`; powers admin dashboard tabs and the notifications endpoint.
- **Nuance:** `status` is a DynamoDB reserved word, so the query uses `ExpressionAttributeNames: { '#status': 'status' }`.

### lineId-status-index

- **Partition key:** `lineId`, **Sort key:** `status`
- **Currently unused in application code.** The `queryChecklists` function never uses this composite index -- it picks `operatorId-index` or `status-index` and then filters `lineId` in memory. This index exists for potential future queries that need to filter by line and status simultaneously without a scan.

## SanitizationConnections

### checklistId-index

- **Partition key:** `checklistId`
- **Used by:** `getConnectionsByChecklist(checklistId)` in `data/connections.ts`
- **Purpose:** Find all WebSocket connections currently viewing a specific checklist.
- **Callers:** The [[WebSocket System]] broadcaster uses this to send real-time item updates, presence lists, status changes, and deletion notices to all users on a checklist.

### channel-index

- **Partition key:** `channel`
- **Used by:** `getConnectionsByChannel(channel)` in `data/connections.ts`
- **Purpose:** Find all WebSocket connections subscribed to a specific channel (e.g., `"dashboard"`).
- **Callers:** The broadcaster uses this with `channel = "dashboard"` to send `new_submission` and `dashboard_refresh` events to all admin dashboard subscribers. See [[Presence Indicators]].

## SanitizationAuditLog

### timestamp-index

- **Partition key:** `action`, **Sort key:** `timestamp`
- **Used by:** `getAuditLogs({ action, startDate, endDate })` in `data/audit.ts`
- **Purpose:** Query audit entries by action type (e.g., `checklist_submitted`) within an optional time range.
- **Callers:** `GET /api/audit?action=checklist_submitted&startDate=...&endDate=...`
- **Nuance:** Despite the name "timestamp-index", the partition key is `action`, not `timestamp`. The sort key is `timestamp`, enabling efficient time-range queries within a given action type.

### userId-index

- **Partition key:** `userId`, **Sort key:** `timestamp`
- **Used by:** `getAuditLogs({ userId, startDate, endDate })` in `data/audit.ts`
- **Purpose:** Query all audit entries by a specific user, optionally within a time range.
- **Callers:** `GET /api/audit?userId=...&startDate=...&endDate=...`
- **Nuance:** Supports three time-range modes: `BETWEEN :start AND :end`, `>= :start`, or no range (all entries for user).

## Query Priority in queryChecklists

The `queryChecklists` function in `data/dynamo.ts` accepts three optional filters: `operatorId`, `status`, and `lineId`. DynamoDB can only query one index at a time, so the function picks the most selective index and filters the rest in JavaScript:

1. **If `operatorId` is provided:** Use `operatorId-index`, then filter by `status` and `lineId` in memory.
2. **If `status` is provided (without `operatorId`):** Use `status-index`, then filter by `lineId` in memory.
3. **Fallback:** Full table scan via `getAllChecklists()`, then filter by `lineId` in memory.

This means operator dashboard queries (which always have `operatorId`) are the most efficient. Admin dashboard queries by status are next. Queries with only `lineId` trigger a full scan. The `lineId-status-index` GSI could optimize case 3 but is not currently wired up.

The `GET /api/checklists` endpoint also handles comma-separated status values (e.g., `status=approved,denied` for the "completed" tab) by running parallel `queryChecklists` calls and merging results.

## See also

- [[DynamoDB Tables]] -- table schemas and attribute descriptions
- [[API Endpoints]] -- which endpoints trigger these queries
- [[Optimistic Concurrency]] -- conditional writes that complement these reads
