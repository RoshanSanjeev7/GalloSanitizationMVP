/**
 * useChecklistSync
 * -----------------------------------------------------------------------------
 * React hook that wires a single checklist view to the WebSocket stream.
 *
 * Given the checklist the user is currently looking at, this hook:
 *   - Subscribes to that checklist's channel on mount (and unsubscribes on
 *     unmount or when `checklistId` changes).
 *   - Listens for every server → client event that can mutate what this
 *     page renders (item / comment / image / status / deletion) and
 *     applies the change to local component state via `setMachines` /
 *     `setStatusChanged` / `setIsDeleted`.
 *   - Tracks which other users are viewing the same checklist so the page
 *     can render a "who's here" indicator.
 *
 * Returned state:
 *   - `presence`       — other users currently viewing this checklist
 *                        (the current user is filtered out).
 *   - `isDeleted`      — true once a `checklist_deleted` event arrives;
 *                        the page should redirect / close.
 *   - `statusChanged`  — populated when the server notifies that the
 *                        checklist moved to a new status (e.g. approved).
 */

import { useEffect, useState, useRef } from 'react';
import { wsClient } from '../services/websocket';
import { updateMachineItem } from '../utils/checklist';
import type { ChecklistMachine } from '../services/api';
import type {
  ItemUpdateMessage,
  CommentUpdateMessage,
  ImageUpdateMessage,
  PresenceMessage,
  StatusChangeMessage,
  ChecklistDeletedMessage,
  PresenceUser,
} from '../types/websocket';

export function useChecklistSync(
  checklistId: string | undefined,
  machines: ChecklistMachine[],
  setMachines: React.Dispatch<React.SetStateAction<ChecklistMachine[]>>,
  // Reserved for callers that track an optimistic-concurrency version number
  // alongside the checklist state. Currently unused inside the hook.
  setVersion?: React.Dispatch<React.SetStateAction<number | undefined>>,
) {
  // Other users viewing this checklist (never includes the current user).
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  // Flipped to `true` if the checklist is deleted server-side while we're on it.
  const [isDeleted, setIsDeleted] = useState(false);
  // Non-null once a remote status transition (submitted/approved/denied) arrives.
  const [statusChanged, setStatusChanged] = useState<{ status: string; by: string } | null>(null);
  // Cached snapshot of the logged-in user, captured once at mount.
  // Used only to filter the current user out of presence — a `useRef` keeps
  // it stable across renders and avoids a re-subscription on every render.
  const currentUser = useRef(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null);

  useEffect(() => {
    // No checklist selected yet (e.g. route params still loading) — skip
    // the whole subscription dance until we have an id.
    if (!checklistId) return;

    // Tell the server we're viewing this checklist so it starts routing
    // per-checklist events (item/comment/image/presence) to this socket.
    wsClient.subscribe(checklistId);

    // ── item_update ─────────────────────────────────────────────
    // A remote user toggled / reassigned / timestamped a checklist item.
    // Merge only the fields that the message actually carries so we don't
    // accidentally overwrite unrelated local fields with `undefined`.
    const offItemUpdate = wsClient.on('item_update', (data) => {
      const msg = data as ItemUpdateMessage;
      // Messages can arrive while a subscription is being torn down; ignore
      // any that don't match the checklist we're currently watching.
      if (msg.checklistId !== checklistId) return;
      setMachines((prev) =>
        updateMachineItem(prev, msg.machineIdx, msg.catIdx, msg.itemIdx, (item) => ({
          ...item,
          completed: msg.completed !== undefined ? msg.completed : item.completed,
          completedBy: msg.completedBy !== undefined ? msg.completedBy : item.completedBy,
          completedAt: msg.completedAt !== undefined ? msg.completedAt : item.completedAt,
        })),
      );
    });

    // ── comment_update ──────────────────────────────────────────
    // A remote user edited the "issue" note on an item. `issue === null`
    // means the note was cleared; we pass it through verbatim.
    const offCommentUpdate = wsClient.on('comment_update', (data) => {
      const msg = data as CommentUpdateMessage;
      if (msg.checklistId !== checklistId) return;
      setMachines((prev) =>
        updateMachineItem(prev, msg.machineIdx, msg.catIdx, msg.itemIdx, (item) => ({
          ...item,
          issue: msg.issue,
        })),
      );
    });

    // ── image_update ────────────────────────────────────────────
    // The S3 key list for an item's photos changed. Server sends the full
    // array (not a delta) so we just replace `images` wholesale.
    const offImageUpdate = wsClient.on('image_update', (data) => {
      const msg = data as ImageUpdateMessage;
      if (msg.checklistId !== checklistId) return;
      setMachines((prev) =>
        updateMachineItem(prev, msg.machineIdx, msg.catIdx, msg.itemIdx, (item) => ({
          ...item,
          images: msg.images,
        })),
      );
    });

    // ── presence ────────────────────────────────────────────────
    // Server pushed the full list of users subscribed to this checklist.
    // We strip ourselves out so the UI only shows "other people here".
    const offPresence = wsClient.on('presence', (data) => {
      const msg = data as PresenceMessage;
      if (msg.checklistId !== checklistId) return;
      const myId = currentUser.current?.id;
      setPresence(msg.users.filter((u: PresenceUser) => u.id !== myId));
    });

    // ── status_change ───────────────────────────────────────────
    // The checklist moved to a new workflow state. Surface it so the
    // caller can show a banner / trigger a refetch.
    const offStatus = wsClient.on('status_change', (data) => {
      const msg = data as StatusChangeMessage;
      if (msg.checklistId !== checklistId) return;
      setStatusChanged({ status: msg.status, by: msg.by });
    });

    // ── checklist_deleted ───────────────────────────────────────
    // The checklist was deleted server-side while we were viewing it.
    // The caller watches `isDeleted` and navigates the user away.
    const offDeleted = wsClient.on('checklist_deleted', (data) => {
      const msg = data as ChecklistDeletedMessage;
      if (msg.checklistId !== checklistId) return;
      setIsDeleted(true);
    });

    // Cleanup on unmount or when `checklistId` changes: tell the server we
    // no longer care about this channel, and detach every listener so we
    // don't leak handlers or double-handle events after a remount.
    return () => {
      wsClient.unsubscribe(checklistId);
      offItemUpdate();
      offCommentUpdate();
      offImageUpdate();
      offPresence();
      offStatus();
      offDeleted();
    };
    // `setMachines` is stable (comes from `useState`), so the effect really
    // only re-runs when the user navigates to a different checklist.
  }, [checklistId, setMachines]);

  return { presence, isDeleted, statusChanged };
}
