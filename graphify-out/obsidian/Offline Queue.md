---
tags:
  - frontend
---

# Offline Queue

The offline queue ensures that checklist saves aren't lost when the network drops. It uses IndexedDB as a local persistence layer with a 24-hour TTL.

## When It Engages

The queue only activates under two specific conditions:

1. `navigator.onLine === false` -- the browser reports no network connectivity
2. The save failed with no HTTP status code -- meaning a true network failure, not a server error

This distinction is important. A 409 (version conflict) or 400 (validation error) is NOT queued -- those are server responses that mean the save was received but rejected. Only saves that never reached the server get queued.

## Storage Layer

The `services/offlineQueue.ts` module uses IndexedDB (via the `idb` pattern of raw `indexedDB` API calls) to store queued saves. Each entry contains:

- `id` -- auto-incremented IndexedDB key
- `checklistId` -- which checklist this save belongs to
- `machineIdx` -- which machine was being saved
- `machine` -- the full machine data object
- `version` -- the expected version at time of save
- `timestamp` -- when the save was queued (for TTL expiry)

## Replay on Reconnect

The `useOfflineQueue` hook listens for the browser's `online` event. When connectivity returns:

1. `clearExpired()` removes any entries older than 24 hours
2. `getQueuedSaves()` retrieves all remaining entries
3. Each save is replayed via `api.updateChecklistMachine()` -- the same [[Per-Machine Auto-Save]] endpoint used by normal saves
4. On success: the entry is removed from IndexedDB
5. On 409/400/404: the entry is discarded (stale version, invalid data, or deleted checklist)
6. On network error (no status): the entry stays in the queue for the next sync attempt

## UI

When there are queued saves, the ChecklistFill page shows a yellow banner: "You have offline changes waiting to sync." A "Sync Now" button lets the user manually trigger `syncQueue()` without waiting for the `online` event.

The `queueCount` state from `useOfflineQueue` drives the banner visibility. During sync, a `syncing` flag shows a spinner.

## Limitations

The version field in queued saves may be stale by the time they replay. If another operator saved in the meantime, the replayed save will get a 409 and be discarded. This means some offline work can be lost if there was concurrent editing. This is an acceptable trade-off -- the alternative (merging diverged states) would be significantly more complex and error-prone for a checklist use case.

**Multi-operator scenario:** In a factory floor environment where multiple operators edit the same checklist, offline queuing has limited value. If Operator A goes offline while Operator B continues editing, ALL of A's queued saves will fail with version conflicts (409) on reconnect and be silently discarded. The offline queue is designed for **brief connectivity blips** (seconds to minutes), not extended offline work. For extended offline scenarios, operators should work on separate machines within the same checklist — per-machine saves reduce conflict surface area.

## See also

- [[Auto-Save and Conflict Resolution]] -- when the offline queue engages in the save lifecycle
- [[Per-Machine Auto-Save]] -- the endpoint replayed on sync
