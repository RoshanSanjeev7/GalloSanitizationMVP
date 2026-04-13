import { useEffect, useRef, useCallback, useState } from 'react';
import { queueSave, getQueuedSaves, removeSave, clearExpired, getQueueCount } from '../services/offlineQueue';
import api from '../services/api';

export function useOfflineQueue() {
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const updateCount = useCallback(async () => {
    try {
      const count = await getQueueCount();
      setQueueCount(count);
    } catch {
      // IndexedDB not available
    }
  }, []);

  const enqueue = useCallback(async (
    checklistId: string,
    machineIdx: number,
    machine: unknown,
    version: number,
  ) => {
    try {
      await queueSave({ checklistId, machineIdx, machine, version });
      await updateCount();
    } catch {
      console.warn('Failed to queue offline save');
    }
  }, [updateCount]);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      await clearExpired();
      const saves = await getQueuedSaves();

      for (const save of saves) {
        try {
          await api.updateChecklistMachine(
            save.checklistId,
            save.machineIdx,
            save.machine as any,
            save.version,
          );
          if (save.id) await removeSave(save.id);
        } catch (err: unknown) {
          const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
          if (status === 409 || status === 400 || status === 404) {
            // Stale, invalid, or deleted — discard
            if (save.id) await removeSave(save.id);
          }
          // Network errors (no status): leave in queue for next sync
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      // Small delay to ensure IndexedDB transaction commits before re-reading count
      await new Promise((r) => setTimeout(r, 100));
      await updateCount();
    }
  }, [updateCount]);

  // Sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      syncQueue();
    };
    window.addEventListener('online', handleOnline);
    updateCount();
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueue, updateCount]);

  return { queueCount, syncing, enqueue, syncQueue };
}
