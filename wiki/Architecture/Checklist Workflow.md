---
tags: [architecture]
created: 2026-04-09
updated: 2026-04-13
---

# Checklist Workflow

The checklist is the central domain object. Its lifecycle drives every other subsystem in the application.

## Status Flow

```
in_progress --> submitted --> approved
                          --> denied
```

There are exactly four states and three transitions. There is no way to move backward -- once a checklist is submitted, it cannot return to `in_progress`. Once it is approved or denied, it stays there permanently. See [[Denied Is Final]] for the reasoning behind this constraint.

## Creating a Checklist

An operator picks a production line from the dashboard. The backend first checks if an in-progress checklist already exists for that line -- **only one in-progress checklist is allowed per line** to prevent duplicates. If one exists, the request is rejected with a 409.

This is enforced by querying `queryChecklists({ status: 'in_progress', lineId })` before creating. If any results exist, the endpoint returns 409 with the existing checklist's ID. This is an application-level check, not a DynamoDB conditional write -- there is a small race window where two simultaneous requests could both pass the check.

If no duplicate exists, the backend looks up the first **published** template assigned to that line (operators can only use published templates; see [[Template Publishing]]). The backend queries the `lineId-index` GSI on the Templates table (see [[DynamoDB Tables]]). It stamps a new checklist with `status: 'in_progress'`, `version: 1`, and a `machines` array generated from the template's structure. The creation is logged to the [[Audit Log]] as `checklist_created`.

## Filling a Checklist

Operators open the checklist in `ChecklistFill.tsx` and work through tasks machine by machine. Each task can be marked as completed (true), flagged with an issue (false + comment text), or left pending (null). Operators can also attach photos to individual tasks.

Multiple operators can fill the same checklist simultaneously. This works because each operator edits one machine at a time, and saves go through [[Per-Machine Auto-Save]] -- a `PUT /:id/machines/:machineIdx` endpoint that uses DynamoDB `UpdateCommand SET machines[N]` to atomically update only that machine's data. Two operators working on different machines never conflict.

Saves fire automatically after a 500ms debounce. The full save lifecycle is described in [[Auto-Save and Conflict Resolution]]. Other operators see changes in real time through the [[WebSocket System]].

## Submitting

When the operator taps Submit, the frontend first awaits any in-flight save (via `savePromiseRef`), then calls `POST /:id/submit`. The backend uses `conditionalStatusTransition` -- an [[Optimistic Concurrency]] write that checks both the current version AND that the status is still `in_progress`. If another operator already submitted, the write fails with a 409.

On success, the backend broadcasts two WebSocket messages: `status_change` to anyone viewing the checklist, and `new_submission` to all dashboard subscribers. The `new_submission` event drives [[Toast Notifications]] on the admin dashboard.

## Reviewing (Approve/Deny)

Admins see submitted checklists on the AdminDashboard. Opening one marks it as "viewed." The admin can review tasks, optionally edit items (admins can write to submitted checklists), and then approve or deny.

Both `POST /:id/approve` and `POST /:id/deny` use `conditionalStatusTransition` to atomically verify the checklist is still `submitted` and the version has not changed. This prevents the scenario described in [[Concurrency Scenarios]] where two admins try to approve and deny the same checklist simultaneously.

## Roles

Who can do what at each stage is governed by [[Roles and Permissions]]. Operators create, fill, and submit. Admins do everything operators can, plus review, delete, export to PDF, and manage users and templates.

## See also

- [[Optimistic Concurrency]] -- the mechanism protecting every transition
- [[Per-Machine Auto-Save]] -- how collaborative editing avoids conflicts
- [[WebSocket System]] -- how participants see each other's changes
