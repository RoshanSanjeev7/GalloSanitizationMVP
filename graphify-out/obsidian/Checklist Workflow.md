---
tags:
  - architecture
  - domain
---

# Checklist Workflow

The checklist is the central domain object. Its lifecycle drives every other subsystem in the application.

## Status Flow

```
in_progress ──► submitted ──► approved
                           ──► denied
```

There are exactly four states and three transitions. There is no way to move backward -- once a checklist is submitted, it cannot return to `in_progress`. Once it's approved or denied, it stays there permanently. See [[Denied Is Final]] for the reasoning behind this constraint.

## Creating a Checklist

An operator picks a production line from the dashboard. The backend looks up the first template assigned to that line via the `lineId-index` GSI on the Templates table (see [[DynamoDB Tables]]). It stamps a new checklist with `status: 'in_progress'`, `version: 1`, and a `machines` array generated from the template's structure -- every task starts with `completed: null`, `completedBy: null`, and an empty `images` array.

The checklist is written with a plain `putChecklist` (no condition) because it's a brand-new item with a fresh UUID. The creation is logged to the [[Audit Log]] as `checklist_created`.

## Filling a Checklist

Operators open the checklist in `ChecklistFill.tsx` and work through tasks machine by machine. Each task can be marked as completed (true), flagged with an issue (false + comment text), or left pending (null). Operators can also attach photos to individual tasks.

Multiple operators can fill the same checklist simultaneously. This works because each operator edits one machine at a time, and saves go through [[Per-Machine Auto-Save]] -- a `PUT /:id/machines/:machineIdx` endpoint that uses DynamoDB `UpdateCommand SET machines[N]` to atomically update only that machine's data. Two operators working on different machines never conflict.

When an operator is editing, saves fire automatically after a 500ms debounce. The full save lifecycle -- including version tracking, conflict detection, and remote update handling -- is described in [[Auto-Save and Conflict Resolution]].

Other operators see changes in real time through the [[WebSocket System]]. When a save succeeds, the backend broadcasts `item_update` and `comment_update` messages to everyone subscribed to that checklist. The frontend applies these deltas without triggering another auto-save (using `remoteUpdateRef`).

## Submitting

When the operator taps Submit, the frontend first awaits any in-flight save (via `savePromiseRef`), then calls `POST /:id/submit`. The backend uses `conditionalStatusTransition` -- a [[Optimistic Concurrency]] write that checks both the current version AND that the status is still `in_progress`. If another operator already submitted (or the checklist was deleted), the write fails with a 409.

On success, the backend broadcasts two WebSocket messages: `status_change` to anyone viewing the checklist, and `new_submission` to all dashboard subscribers. The `new_submission` event drives [[Toast Notifications]] on the admin dashboard.

## Reviewing (Approve/Deny)

Admins see submitted checklists on the AdminDashboard. Opening one marks it as "viewed" (atomic `UpdateCommand` that sets `viewedAt` and `viewedBy` without interfering with other fields). The admin can review tasks, optionally edit items (admins can write to submitted checklists), and then approve or deny.

Both `POST /:id/approve` and `POST /:id/deny` use `conditionalStatusTransition` to atomically verify the checklist is still `submitted` and the version hasn't changed. This prevents the scenario described in [[Concurrency Scenarios]] where two admins try to approve and deny the same checklist simultaneously -- the second one gets a 409.

## Roles

Who can do what at each stage is governed by [[Roles and Permissions]]. Operators create, fill, and submit. Admins do everything operators can, plus review, delete, export to PDF, and manage users and templates.

## See also

- [[Optimistic Concurrency]] -- the mechanism protecting every transition
- [[Per-Machine Auto-Save]] -- how collaborative editing avoids conflicts
- [[WebSocket System]] -- how participants see each other's changes
