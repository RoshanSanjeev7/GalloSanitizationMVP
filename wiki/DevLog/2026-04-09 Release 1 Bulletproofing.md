---
tags: [devlog]
created: 2026-04-09
updated: 2026-04-13
---

# 2026-04-09 Release 1 Bulletproofing

The first hardening pass focused on making the application safe for concurrent use. Before this release, the app worked fine for a single user but had race conditions and missing guards that would cause data loss with multiple users.

## What Shipped

### Conditional Writes

Replaced all bare `PutCommand` calls on the Checklists table with conditional versions. Three new functions in `dynamo.ts`: `conditionalPutChecklist` (version check), `conditionalStatusTransition` (version + status check), `conditionalDeleteChecklist` (existence check). Every 409 response is now an intentional, handled case rather than silent data loss. See [[Optimistic Concurrency]].

### Per-Machine Save Endpoint

Added `PUT /:id/machines/:machineIdx` using DynamoDB `UpdateCommand` instead of `PutCommand`. This was the single biggest improvement for multi-operator editing -- two operators on different machines no longer conflict. See [[Per-Machine Auto-Save]].

### Rate Limiting

Added `express-rate-limit` with three tiers: 100/min global, 10/15min login, 5/min checklist creation. Production-only. See [[Rate Limiting]].

### Input Validation

Added `validateMachines()` for structural validation of checklist payloads. Added image MIME whitelist, per-item (20) and per-checklist (200) image limits, image key ownership checks, and 1MB body size limit. See [[Input Validation]].

### Frontend Guards

- Submit/Approve/Deny buttons disable during API calls (prevent double-tap)
- `AbortController` on dashboard filter changes (cancel stale requests)
- `savingRef` prevents concurrent saves
- Submit handler awaits in-flight save before submitting

### Admin Safety

Cannot self-delete, cannot delete last admin, cannot demote last admin. See [[Admin Safety]].

### JWT 8-Hour Expiry

Changed from 1 hour to 8 hours to match operator shift length. Added proactive refresh 30 minutes before expiry. See [[JWT Design]].

### Pagination

All list endpoints now accept `limit` (capped at 100) and `offset`, returning `{ items, total, hasMore }`. See [[API Endpoints]].

### Email Uniqueness

Transactional write for user creation with EMAIL# lock items. See [[Email Uniqueness]].

## See also

- [[Optimistic Concurrency]] -- the core mechanism added in this release
- [[2026-04-10 Release 2 WebSocket]] -- the next release
- [[Concurrency Scenarios]] -- every race condition this release addressed
