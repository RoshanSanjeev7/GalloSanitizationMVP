---
tags: [decision]
created: 2026-04-09
updated: 2026-04-13
---

# Denied Is Final

When an admin denies a checklist, its status changes to `denied` permanently. The operator must create a new checklist and start over. There is no "reopen" or "return to in progress" transition.

## Why

**Simpler state machine.** The status flow is `in_progress -> submitted -> approved/denied` (see [[Checklist Workflow]]). Adding a `denied -> in_progress` transition would create a cycle, making it harder to reason about checklist state and test all paths. Every conditional write and UI guard would need to account for checklists that had been denied and reopened.

**Clean audit trail.** Each checklist represents one complete attempt at filling out a sanitation checklist. If denied, the [[Audit Log]] records that denial as a final event. A new checklist gets its own audit trail, making it easy to trace the history: "This line was attempted on Monday (denied), then completed on Tuesday (approved)."

**No status regression.** The [[Optimistic Concurrency]] system uses `conditionalStatusTransition` which checks that the current status matches the expected status. Allowing denied checklists to reopen would require distinguishing between "denied and awaiting reopen" vs "denied and finalized."

## Alternative Considered

The obvious alternative: denied checklists return to `in_progress`, preserving the operator's existing work. The operator fixes the flagged items and re-submits.

This was rejected because:
1. It requires tracking "which items were flagged by the admin" vs "which items the operator already filled"
2. The state machine gets more complex (`denied` becomes a temporary state)
3. Sanitation checklists are time-sensitive daily tasks -- re-doing from scratch is not burdensome

## Practical Impact

Operators starting a new checklist lose their previous answers. But since the templates are the same, the structure is identical -- they just need to re-check the items. The denied checklist remains viewable (read-only) on the Completed tab in [[Frontend Pages]], so operators can reference what they did before.

## See also

- [[Checklist Workflow]] -- the status flow this constrains
- [[Audit Log]] -- the clean audit trail this enables
- [[Optimistic Concurrency]] -- the conditional writes that enforce finality
