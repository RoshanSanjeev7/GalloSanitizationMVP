---
tags: [subsystem, frontend]
created: 2026-04-13
updated: 2026-04-13
---

# Frontend Hooks

The application uses six custom React hooks that encapsulate WebSocket connections, real-time sync, image loading, offline resilience, and UI notifications. All hooks are in `frontend/src/hooks/`.

## useWebSocket

**File:** `hooks/useWebSocket.ts`

**Params:** None.

**Returns:** `{ connected: boolean, reconnecting: boolean }`

**What it does:** Manages the global WebSocket connection lifecycle tied to Redux auth state. When a user is logged in and a token exists in `localStorage`, it calls `wsClient.connect(token)`. When the user logs out or the component unmounts, it calls `wsClient.disconnect()`. It subscribes to `wsClient.onStatusChange` to expose connection status.

**Used in:** `App.tsx` -- called once at the app root. The `reconnecting` flag drives the reconnection indicator in the UI.

**Edge cases:**
- If the user logs out while the socket is connected, `disconnect()` is called in the cleanup function.
- The hook re-runs when `user` changes in Redux, so a fresh login triggers a new connection.

## useChecklistSync

**File:** `hooks/useChecklistSync.ts`

**Params:**
- `checklistId: string | undefined` -- the checklist to subscribe to
- `machines: ChecklistMachine[]` -- current machines state (used as dependency)
- `setMachines: React.Dispatch<React.SetStateAction<ChecklistMachine[]>>` -- state setter for applying remote updates
- `setVersion?: React.Dispatch<React.SetStateAction<number | undefined>>` -- optional version state setter

**Returns:** `{ presence: PresenceUser[], isDeleted: boolean, statusChanged: { status: string, by: string } | null }`

**What it does:** Subscribes to the WebSocket for a specific checklist and handles six message types:
- `item_update` -- applies `completed`, `completedBy`, `completedAt` changes to the local machines state via `updateMachineItem` helper
- `comment_update` -- applies `issue` field changes
- `image_update` -- replaces the `images` array on a specific item
- `presence` -- updates the list of other users viewing this checklist (filters out the current user by ID from `localStorage`)
- `status_change` -- sets `statusChanged` state (used to show banners like "This checklist was approved by...")
- `checklist_deleted` -- sets `isDeleted` to true (triggers redirect and banner)

On mount, calls `wsClient.subscribe(checklistId)`. On unmount, calls `wsClient.unsubscribe(checklistId)` and removes all listeners.

**Used in:** `ChecklistFill.tsx` (operator editing), `SubmissionReview.tsx` (admin reviewing).

**Edge cases:**
- If `checklistId` is undefined, the effect is skipped entirely (no subscription).
- Messages for other checklists are silently ignored (each handler checks `msg.checklistId !== checklistId`).
- The `setMachines` callback uses functional updates (`prev => ...`) to avoid stale closure issues.

## usePresenceSummary

**File:** `hooks/usePresenceSummary.ts`

**Params:** None.

**Returns:** `{ presenceMap: Record<string, PresenceUser[]> }` -- keyed by checklist ID, each value is a list of users viewing that checklist.

**What it does:** Subscribes to the `dashboard` WebSocket channel to receive `presence_summary` messages. These messages contain a map of all active checklists and who is currently viewing them. On mount, calls `wsClient.subscribeDashboard()`. On unmount, calls `wsClient.unsubscribeDashboard()`.

**Used in:** `AdminDashboard.tsx` -- shows presence avatars on checklist cards so admins can see who is currently editing each checklist.

**Edge cases:**
- The `PresenceUser` type includes `machine: number | null`, showing which machine tab each user has open.
- If the WebSocket is disconnected, the presence map remains stale until reconnection (no automatic clearing).

## useImageUrlsForMachines

**File:** `hooks/useImageUrls.ts` (exported alongside the lower-level `useImageUrls` hook)

**Params:**
- `checklistId: string | undefined`
- `machines: { categories: { items: { images?: string[] }[] }[] }[]` -- the machines array to scan for image keys
- `activeMachine?: number` -- optional; if provided, only loads images for that machine

**Returns:** `Record<string, string>` -- a map from S3 image key to presigned URL.

**What it does:** Internally uses `useImageUrls(checklistId)` which maintains a `loadedRef` Set to track which keys have already been fetched. When machines change, the effect extracts all image keys (or just the active machine's keys), passes missing ones to `loadMissing`, which calls `api.getImageUrls(checklistId, missingKeys)` -- the batch presigned URL endpoint. URLs are accumulated in state across multiple calls.

**Used in:** `ChecklistFill.tsx` (with `activeMachine` for lazy loading), `ChecklistDetail.tsx` (all machines), `SubmissionReview.tsx` (all machines).

**Edge cases:**
- The `loadedRef` prevents duplicate API calls for the same key across re-renders.
- If `checklistId` is undefined, `loadMissing` is a no-op.
- Presigned URLs expire (default S3 expiry); the hook does not refresh them. Long-open pages may show broken images.

## useOfflineQueue

**File:** `hooks/useOfflineQueue.ts`

**Params:** None.

**Returns:** `{ queueCount: number, syncing: boolean, enqueue: (checklistId, machineIdx, machine, version) => Promise<void>, syncQueue: () => Promise<void> }`

**What it does:** Provides an IndexedDB-backed queue for failed per-machine saves. When a network error occurs during auto-save, the caller uses `enqueue()` to persist the save payload to IndexedDB. The hook listens for the browser `online` event and automatically calls `syncQueue()` to replay queued saves.

During sync, each queued save is replayed via `api.updateChecklistMachine()`. If the replay succeeds, the entry is removed from the queue. If it fails with 409, 400, or 404, the entry is discarded (stale, invalid, or deleted). If it fails with a network error (no status code), the entry stays in the queue for the next sync attempt.

Before syncing, `clearExpired()` removes entries older than the expiry threshold to prevent replaying very stale saves.

**Used in:** `ChecklistFill.tsx` -- the `queueCount` drives a badge showing pending offline saves, `syncing` disables the manual sync button, and `enqueue` is called from the save error handler.

**Edge cases:**
- If IndexedDB is unavailable (e.g., private browsing in some browsers), `enqueue` fails silently with a console warning.
- The `syncingRef` prevents concurrent sync attempts.
- A 100ms delay after syncing ensures IndexedDB transactions commit before re-reading the count.

## useToasts

**File:** `hooks/useToasts.ts`

**Params:** None.

**Returns:** `{ toasts: ToastData[], addToast: (message, type?, action?) => void, dismissToast: (id) => void }`

**What it does:** Manages a list of toast notifications. `addToast` creates a new toast with a unique auto-incrementing ID, message, type (`'info'`, `'success'`, `'error'`, `'warning'`), and optional action callback. `dismissToast` removes a toast by ID.

The `ToastData` type comes from `components/Toast` and includes `{ id, message, type, action? }` where `action` is `{ label: string, onClick: () => void }`.

**Used in:** `AdminDashboard.tsx` -- toasts are triggered by WebSocket events (new submissions, status changes) and rendered by the `ToastContainer` component. The toast slides in from the top-right and auto-dismisses after a timeout.

**Edge cases:**
- The module-level `nextId` counter persists across re-renders but resets on page refresh. This is fine since toast IDs only need to be unique within a session.
- Toasts accumulate in state until dismissed; there is no automatic limit on the number of visible toasts.

## See also

- [[Frontend Pages]] -- which pages use which hooks
- [[WebSocket System]] -- the `wsClient` singleton that the hooks wrap
- [[Offline Queue]] -- the IndexedDB service layer under `useOfflineQueue`
