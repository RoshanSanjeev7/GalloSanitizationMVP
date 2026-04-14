---
tags: [decision]
created: 2026-04-09
updated: 2026-04-13
---

# Concurrency Scenarios

Every race condition in the system, with the exact mechanism that prevents data corruption. All of these are covered by the [[Optimistic Concurrency]] conditional writes.

## Dual Submit

**Scenario:** Two operators both hit Submit on the same checklist within milliseconds.

**Mechanism:** `conditionalStatusTransition` checks `#s = :es AND #v = :ev` where `es = 'in_progress'`. The first submit writes `status: 'submitted'` and increments the version. The second submit's condition fails because status is no longer `in_progress`.

**Result:** First submitter succeeds. Second gets 409.

## Dual Approve

**Scenario:** Two admins both click Approve on the same submitted checklist.

**Mechanism:** Same pattern -- first approve writes `status: 'approved'`. Second approve fails because status is no longer `submitted`.

**Result:** First admin succeeds. Second gets 409. The [[Presence Indicators]] on SubmissionReview help admins see that someone else is also reviewing.

## Approve + Deny Race

**Scenario:** Admin A clicks Approve while Admin B clicks Deny on the same checklist.

**Mechanism:** Both check `status === 'submitted'`. Whichever DynamoDB processes first wins.

**Result:** One succeeds, the other gets 409.

## Delete While Reviewing

**Scenario:** Admin A deletes a checklist while Admin B is reviewing it.

**Mechanism:** `conditionalDeleteChecklist` uses `attribute_exists(id)`. Admin A's delete succeeds. When Admin B tries to approve/deny, `getChecklist` returns undefined and the endpoint returns 404.

**Result:** Delete succeeds. Review attempt gets a clear error.

## Operator Editing While Admin Approves

**Scenario:** An operator is still filling out a checklist when an admin tries to approve it.

**Mechanism:** The operator's checklist has `status: 'in_progress'`. The approve endpoint checks `status === 'submitted'`. Since the checklist has not been submitted, approve fails with 400.

**Result:** Admin is blocked until the operator submits. This is by design -- see [[Checklist Workflow]].

## Two Operators, Same Machine

**Scenario:** Operator A and Operator B are both editing machine 0 on the same checklist.

**Mechanism:** Both use `PUT /:id/machines/0` with [[Per-Machine Auto-Save]]. The first save succeeds and bumps version. The second save's version check fails.

**Result:** Second operator gets a 409 conflict. The [[Auto-Save and Conflict Resolution]] system shows a yellow banner. The [[WebSocket System]] broadcasts the first operator's changes.

## Two Operators, Different Machines

**Scenario:** Operator A edits machine 0 while Operator B edits machine 1.

**Mechanism:** Both use [[Per-Machine Auto-Save]]. Since they write to different array indices (`SET machines[0]` vs `SET machines[1]`), the writes do not overwrite each other. However, they share the version counter, so the second write can fail if it uses a stale version.

**Result:** Usually succeeds because the WebSocket broadcasts the updated version. If a conflict happens, it resolves quickly on reload.

## Button Spam (Double-Submit, Double-Approve)

**Scenario:** User clicks Submit or Approve multiple times rapidly.

**Mechanism:** Frontend disables the button during the API call. Even if the guard fails, the backend's conditional write ensures only the first request succeeds.

**Result:** First click works. Subsequent clicks are blocked by UI or rejected by backend.

## Duplicate Email Creation

**Scenario:** Two admins try to create users with the same email simultaneously.

**Mechanism:** `createUserWithEmailLock` uses a `TransactWriteCommand` that atomically creates both the user item and an `EMAIL#<email>` lock item. See [[Email Uniqueness]].

**Result:** First creation succeeds. Second gets 409: "Email already exists."

## Admin Self-Delete

**Scenario:** An admin tries to delete their own account.

**Mechanism:** The `DELETE /users/:id` handler checks `req.userId === req.params.id` before doing anything else.

**Result:** 400: "Cannot delete your own account." See [[Admin Safety]].

## See also

- [[Optimistic Concurrency]] -- the mechanism powering all these protections
- [[Per-Machine Auto-Save]] -- the different-machine scenario
- [[Admin Safety]] -- self-delete and last-admin protections
