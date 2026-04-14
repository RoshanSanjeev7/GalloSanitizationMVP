---
tags: [subsystem]
created: 2026-04-10
updated: 2026-04-13
---

# Presence Indicators

Presence indicators show which users are currently viewing or editing a checklist, giving operators and admins situational awareness about who else is working on the same data.

## Where They Appear

### AdminDashboard rows

Each checklist row on the admin dashboard shows overlapping avatar circles for users currently editing that checklist. This uses the `presence_summary` WebSocket message, broadcast every 10 seconds. The `PresenceAvatars` component renders overlapping circles with user initials and a tooltip showing full names.

### ChecklistFill header

When an operator opens a checklist, the top of the page shows co-editors with an "also editing" label. This uses the `presence` WebSocket message, which fires immediately when anyone subscribes, unsubscribes, or switches machines. The current user is excluded. The presence data also shows which machine tab each co-editor has selected.

### SubmissionReview sidebar

When an admin opens a submitted checklist, a sidebar section shows "Currently Viewing" with avatars of other admins who also have it open. This helps prevent the scenario where two admins make conflicting approve/deny decisions -- they can see that someone else is already reviewing. See [[Concurrency Scenarios]] for that scenario.

## Data Flow

1. User opens a checklist page. The `useChecklistSync` hook calls `wsClient.subscribe(checklistId)`.
2. The [[WebSocket System]] backend receives the `subscribe` message, updates the connection's `checklistId` in the Connections table (see [[DynamoDB Tables]]), and broadcasts an updated `presence` message.
3. When the user switches machine tabs, the frontend sends `wsClient.machineChange(checklistId, machineIdx)`. The backend updates `activeMachine` and re-broadcasts presence.
4. When the user closes the page, the hook calls `wsClient.unsubscribe(checklistId)`. The backend removes the subscription and broadcasts updated presence.
5. If the WebSocket connection drops entirely, the `onclose` handler deletes the connection record and broadcasts updated presence.

## PresenceAvatars Component

`PresenceAvatars` takes a `users` array and renders overlapping colored circles. Each circle shows the user's initials. Colors are assigned deterministically based on the user ID hash for consistent colors across sessions. A tooltip on hover shows the full name and current machine.

## Staleness

The Connections table has a TTL field set to 30 minutes from the last activity. If a browser crashes without a clean disconnect, the user appears as a ghost for up to 30 minutes. The 60-second heartbeat keeps the TTL refreshed for active users. A production improvement would add server-side ping/pong detection. See [[Known Limitations]].

## See also

- [[WebSocket System]] -- the underlying transport for presence data
- [[Frontend Pages]] -- where presence indicators are rendered
- [[DynamoDB Tables]] -- the Connections table that tracks who is where
