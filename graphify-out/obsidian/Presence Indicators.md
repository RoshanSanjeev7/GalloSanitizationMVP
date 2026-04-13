---
tags:
  - frontend
---

# Presence Indicators

Presence indicators show which users are currently viewing or editing a checklist, so operators and admins have situational awareness about who else is working on the same data.

## Where They Appear

### AdminDashboard rows

Each checklist row on the admin dashboard shows overlapping avatar circles for users currently editing that checklist. This uses the `presence_summary` WebSocket message, which the server broadcasts every 10 seconds to all connected clients. The summary is a map of `checklistId -> PresenceUser[]`, where each user has `id`, `name`, `role`, and `machine` (the machine tab they have open).

The dashboard's `usePresenceSummary` hook (part of `useChecklistSync`) listens for `presence_summary` events and stores the data in component state. The `PresenceAvatars` component renders the overlapping circles with user initials and a tooltip showing full names.

### ChecklistFill header

When an operator opens a checklist, the top of the page shows co-editors with an "also editing" label. This uses the `presence` WebSocket message, which fires immediately when anyone subscribes, unsubscribes, or switches machines on that checklist. The current user is excluded from the display.

The presence data also shows which machine tab each co-editor has selected, so you can tell if someone else is working on the same machine as you.

### SubmissionReview sidebar

When an admin opens a submitted checklist for review, a sidebar section shows "Currently Viewing" with avatar(s) of other admins who also have this checklist open. This helps prevent the scenario where two admins review and make conflicting approve/deny decisions -- they can see that someone else is already looking at it.

## Data Flow

1. User opens a checklist page. The `useChecklistSync` hook calls `wsClient.subscribe(checklistId)`.
2. The [[WebSocket System]] backend receives the `subscribe` message, updates the connection's `checklistId` in the Connections table (see [[DynamoDB Tables]]), and broadcasts an updated `presence` message to all subscribers.
3. When the user switches machine tabs, the frontend sends `wsClient.machineChange(checklistId, machineIdx)`. The backend updates `activeMachine` and re-broadcasts presence.
4. When the user closes the page, the hook calls `wsClient.unsubscribe(checklistId)`. The backend removes the subscription and broadcasts updated presence.
5. If the WebSocket connection drops entirely (browser close, network loss), the `onclose` handler in `LocalWsBroadcaster` deletes the connection record and broadcasts updated presence.

## PresenceAvatars Component

`PresenceAvatars` takes a `users` array and renders overlapping colored circles. Each circle shows the user's initials (first letter of first name + first letter of last name). Colors are assigned deterministically based on the user ID hash to ensure consistent colors across sessions. A tooltip on hover shows the full name and current machine.

## Staleness

The Connections table has a TTL field set to 30 minutes from the last activity. If a user's browser crashes without a clean disconnect, the connection record will be auto-deleted by DynamoDB TTL. In the meantime (up to 30 minutes), that user may appear as a ghost presence. The 60-second heartbeat from the [[WebSocket System]] frontend client keeps the TTL refreshed for active users.

## See also

- [[WebSocket System]] -- the underlying transport for presence data
- [[Frontend Pages]] -- where presence indicators are rendered
- [[DynamoDB Tables]] -- the Connections table that tracks who's where
