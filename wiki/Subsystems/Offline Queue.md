---
tags: [subsystem]
created: 2026-04-10
updated: 2026-04-13
---

# Offline Queue

The offline queue ensures that checklist saves are not lost when the network drops. It uses IndexedDB as a local persistence layer with a 24-hour TTL.

## When It Engages

The queue only activates under two specific conditions:

1. `navigator.onLine === false` -- the browser reports no network connectivity
2. The save failed with no HTTP status code -- meaning a true network failure, not a server error

This distinction is important. A 409 (version conflict) or 400 (validation error) is NOT queued -- those are server responses that mean the save was received but rejected. Only saves that never reached the server get queued.

## Storage Layer

The `services/offlineQueue.ts` module uses IndexedDB to store queued saves. Each entry contains:

- `id` -- auto-incremented IndexedDB key
- `checklistId` -- which checklist this save belongs to
- `machineIdx` -- which machine was being saved
- `machine` -- the full machine data object
- `version` -- the expected version at time of save
- `timestamp` -- when the save was queued (for TTL expiry)

## Replay on Reconnect

The `useOfflineQueue` hook listens for the browser's `online` event. When connectivity returns:

1. `clearExpired()` removes entries older than 24 hours
2. `getQueuedSaves()` retrieves all remaining entries
3. Each save is replayed via `api.updateChecklistMachine()` -- the same [[Per-Machine Auto-Save]] endpoint used by normal saves
4. On success: the entry is removed from IndexedDB
5. On 409/400/404: the entry is discarded (stale version, invalid data, or deleted checklist)
6. On network error: the entry stays in the queue for the next sync attempt

## UI

When there are queued saves, the ChecklistFill page shows a yellow banner: "You have offline changes waiting to sync." A "Sync Now" button lets the user manually trigger `syncQueue()` without waiting for the `online` event.

## Limitations

The version field in queued saves may be stale by the time they replay. If another operator saved in the meantime, the replayed save will get a 409 and be discarded. In a multi-operator scenario where Operator A goes offline while Operator B continues editing, all of A's queued saves will fail with version conflicts on reconnect. The offline queue is designed for **brief connectivity blips**, not extended offline work. For extended scenarios, operators should work on separate machines within the same checklist to reduce conflict surface area. See [[Auto-Save and Conflict Resolution]] for the broader save lifecycle.

## See also

- [[Auto-Save and Conflict Resolution]] -- when the offline queue engages in the save lifecycle
- [[Per-Machine Auto-Save]] -- the endpoint replayed on sync
- [[Known Limitations]] -- offline queue limitations in multi-operator scenarios
- [[Error Handling]] -- how offline errors are caught and queued
- [[Frontend Hooks]] -- the `useOfflineQueue` hook that wraps this subsystem
