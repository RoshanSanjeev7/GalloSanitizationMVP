---
tags: [subsystem]
created: 2026-04-09
updated: 2026-04-13
---

# Optimistic Concurrency

Every write to the Checklists table uses a conditional expression to prevent race conditions. The pattern: read the current version, attempt to write with a condition that the version has not changed, increment the version on success. If another write slipped in between, DynamoDB throws `ConditionalCheckFailedException` and the backend returns HTTP 409.

## Why This Matters

Without conditional writes, a bare `PutCommand` would silently overwrite whatever was there. Consider two operators saving at the same time -- the last one to write would erase the first operator's changes with no warning. Conditional writes make this impossible: the second write fails with a 409, and the frontend shows a conflict banner prompting the user to reload.

## The Three Conditional Write Functions

All three live in `backend/src/data/dynamo.ts`.

### conditionalPutChecklist(checklist, expectedVersion)

Used by `PUT /:id/items` (the legacy full-machines save endpoint). Writes the entire checklist item with `version: expectedVersion + 1`, conditioned on `#v = :ev`. If another save bumped the version in between, this fails.

### conditionalStatusTransition(checklist, expectedStatus, expectedVersion)

Used by submit, approve, and deny. Checks both version AND current status:

```
ConditionExpression: '#v = :ev AND #s = :es'
```

This is stronger than a pure version check. It prevents approving a checklist that was already denied, and prevents double-submitting.

### conditionalDeleteChecklist(id)

Used by `DELETE /:id`. Checks that the item exists via `attribute_exists(id)`. Returns 404 instead of silently succeeding on a nonexistent item.

## Per-Machine Writes

The [[Per-Machine Auto-Save]] endpoint uses `updateChecklistMachine`, which is a DynamoDB `UpdateCommand` with a version condition:

```
UpdateExpression: 'SET machines[N] = :machine, #v = :nv, updatedAt = :ua, ...'
ConditionExpression: '#v = :ev'
```

This is more granular than `conditionalPutChecklist` because it only writes one machine's data via `SET machines[N]`. Two operators on different machines will still conflict on the version number, but in practice this is rare because the 500ms debounce means saves are well-spaced and the [[WebSocket System]] broadcasts the new version to other clients.

## Frontend Handling of 409s

When the frontend receives a 409 from any save endpoint, it sets `saveStatus` to `'conflict'` and shows a yellow banner: "This checklist was modified by another user. Reload to see the latest version." See [[Auto-Save and Conflict Resolution]] for the full flow.

For concrete examples of every race condition and how the system handles it, see [[Concurrency Scenarios]].

## See also

- [[Checklist Workflow]] -- the transitions being protected
- [[Auto-Save and Conflict Resolution]] -- the frontend side of conflict handling
- [[Concurrency Scenarios]] -- every race condition mapped out
