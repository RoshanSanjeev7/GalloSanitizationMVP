---
tags: [subsystem]
created: 2026-04-10
updated: 2026-04-13
---

# Auto-Save and Conflict Resolution

The `ChecklistFill` page has the most complex state management in the frontend. Here is the full save lifecycle from user action to confirmed persistence.

## The Save Cycle

1. **User edits** -- toggles a task, types a comment, etc. This calls `setMachines(...)` which updates the local machines state.

2. **Debounce** -- A `useEffect` watching `machines` state fires a 500ms debounce timer. If the user makes another edit within 500ms, the timer resets.

3. **Remote update guard** -- Before saving, the effect checks `remoteUpdateRef.current`. If true, the machines change came from a WebSocket delta (not a user action), so it skips the save and resets the ref. This prevents an infinite loop: remote update arrives via the [[WebSocket System]], updates local state, triggers debounce, which would save the same data back.

4. **Concurrent save guard** -- `savingRef.current` prevents overlapping saves. If a save is already in flight, the next debounce will fire after the current one completes. `savePromiseRef.current` holds the active save's promise so the submit handler can await it.

5. **API call** -- `api.updateChecklistMachine(id, activeMachine, machines[activeMachine], version)` sends the current machine's data and the local version number to the [[Per-Machine Auto-Save]] endpoint.

6. **Version update** -- On success, the response contains the new version number. The frontend updates its local `version` state. This is critical for the next save -- if we did not update, the next save would use the old version and get a 409.

7. **Status indicator** -- `saveStatus` transitions: `idle` -> `saving` -> `saved` (for 2 seconds) -> `idle`. The user sees "Saving...", then a check mark.

## Conflict Handling (409)

When [[Optimistic Concurrency]] fails and the backend returns 409:

1. `saveStatus` is set to `'conflict'`
2. A yellow banner appears: "This checklist was modified by another user."
3. A "Reload" button fetches the latest checklist from the server
4. On reload, `machines`, `version`, and `saveStatus` are all reset

The 409 does not mean data was lost -- the user's local changes are still in component state. But since the server version has diverged, the user needs to reload to get a consistent base.

## WebSocket Remote Updates

When the [[WebSocket System]] delivers an `item_update`, `comment_update`, or `image_update`, the `useChecklistSync` hook applies the delta to local state via `setMachinesRemote`. This wrapper sets `remoteUpdateRef.current = true` before calling `setMachines(fn)`, ensuring step 3 of the save cycle skips the save.

For `status_change` messages (e.g., another operator submitted, or admin approved), the hook shows appropriate UI -- a redirect or a status message.

## Submit Guard

When the user taps Submit, the handler:

1. Awaits `savePromiseRef.current` if a save is in flight
2. Calls `api.submitChecklist(id)`
3. On 409: shows an error message (checklist was already submitted or modified)
4. On success: navigates back to the dashboard

The `submitting` state disables the Submit button during the API call to prevent double-tap.

## Offline Fallback

If a save fails with no HTTP status code (true network failure) and `navigator.onLine` is false, the save is queued to the [[Offline Queue]]. The queue replays saves when connectivity returns.

## See also

- [[Per-Machine Auto-Save]] -- the backend endpoint being called
- [[Optimistic Concurrency]] -- what causes 409 conflicts
- [[Offline Queue]] -- the IndexedDB fallback for network failures
