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
  setVersion?: React.Dispatch<React.SetStateAction<number | undefined>>,
) {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [isDeleted, setIsDeleted] = useState(false);
  const [statusChanged, setStatusChanged] = useState<{ status: string; by: string } | null>(null);
  const currentUser = useRef(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null);

  useEffect(() => {
    if (!checklistId) return;

    wsClient.subscribe(checklistId);

    const offItemUpdate = wsClient.on('item_update', (data) => {
      const msg = data as ItemUpdateMessage;
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

    const offPresence = wsClient.on('presence', (data) => {
      const msg = data as PresenceMessage;
      if (msg.checklistId !== checklistId) return;
      // Filter out current user from presence display
      const myId = currentUser.current?.id;
      setPresence(msg.users.filter((u: PresenceUser) => u.id !== myId));
    });

    const offStatus = wsClient.on('status_change', (data) => {
      const msg = data as StatusChangeMessage;
      if (msg.checklistId !== checklistId) return;
      setStatusChanged({ status: msg.status, by: msg.by });
    });

    const offDeleted = wsClient.on('checklist_deleted', (data) => {
      const msg = data as ChecklistDeletedMessage;
      if (msg.checklistId !== checklistId) return;
      setIsDeleted(true);
    });

    return () => {
      wsClient.unsubscribe(checklistId);
      offItemUpdate();
      offCommentUpdate();
      offImageUpdate();
      offPresence();
      offStatus();
      offDeleted();
    };
  }, [checklistId, setMachines]);

  return { presence, isDeleted, statusChanged };
}
