---
tags:
  - backend
  - frontend
---

# Per-Machine Auto-Save

This is the key innovation that makes multi-operator editing work without constant conflicts.

## The Problem

The original approach used `PUT /:id/items` to send the entire `machines` array on every save. If two operators were editing different machines on the same checklist, their saves would constantly overwrite each other. Operator A saves machines[0], then Operator B saves machines[1] -- but B's save includes the stale version of machines[0], erasing A's work. Even with [[Optimistic Concurrency]], this meant constant 409 conflicts that forced reloads.

## The Solution

`PUT /:id/machines/:machineIdx` sends only the data for a single machine. The backend uses a DynamoDB `UpdateCommand` instead of `PutCommand`:

```typescript
UpdateExpression: `SET machines[${machineIdx}] = :machine, #v = :nv, updatedAt = :ua, viewedAt = :null, viewedBy = :null`
ConditionExpression: '#v = :ev'
```

`SET machines[N]` atomically replaces only that element of the machines array. The rest of the array is untouched. Two operators on different machines will never write to the same array index.

## Version Conflicts Are Still Possible

Even with per-machine saves, the version field is shared across the entire checklist. If Operator A saves machines[0] and bumps version from 5 to 6, then Operator B tries to save machines[1] with `expectedVersion: 5`, B's write will fail because the version is now 6.

In practice this is rare because:
1. The 500ms debounce means saves don't fire on every keystroke
2. The [[WebSocket System]] broadcasts the new version to other clients, so they update their local version before their next save fires
3. When it does happen, the frontend shows a conflict banner and the user reloads

## Activity Tracking

The per-machine save endpoint also handles comment detection. It compares the old machine's items against the new machine's items, looking for new `issue` values. If found, it creates an `Activity` record with `type: 'comment'` and appends it to the checklist's `activities` array using `list_append`. This activity timeline shows up in the checklist detail view.

The endpoint also resets `viewedAt` and `viewedBy` to null on every save, so the admin's notification bell reflects that new activity has occurred since they last looked.

## WebSocket Broadcasting

After a successful per-machine save, the route handler diffs old vs new items and broadcasts granular updates:
- `item_update` for any changed `completed` value
- `comment_update` for any changed `issue` value

These are sent via `broadcastToChecklist` with `excludeUserId` set to the saving user, so they only go to *other* operators. The frontend's `useChecklistSync` hook receives these deltas and applies them to local state, setting `remoteUpdateRef.current = true` to prevent the update from triggering another auto-save cycle. See [[Auto-Save and Conflict Resolution]] for this mechanism.

## See also

- [[Optimistic Concurrency]] -- the conditional write backing per-machine saves
- [[WebSocket System]] -- how other operators see the saved changes
- [[Checklist Workflow]] -- the collaborative editing this enables
