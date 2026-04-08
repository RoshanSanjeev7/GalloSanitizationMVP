import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';

/**
 * Manages image URL loading for checklist images stored in S3.
 * Automatically loads missing URLs when imageKeys change.
 */
export function useImageUrls(checklistId: string | undefined) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const loadedRef = useRef<Set<string>>(new Set());

  const loadMissing = useCallback((keys: string[]) => {
    if (!checklistId) return;
    for (const key of keys) {
      if (loadedRef.current.has(key)) continue;
      loadedRef.current.add(key);
      api.getImageUrl(checklistId, key).then((url) => {
        setImageUrls((prev) => ({ ...prev, [key]: url }));
      });
    }
  }, [checklistId]);

  return { imageUrls, loadMissing };
}

/**
 * Auto-loads image URLs for machine items.
 * Pass activeMachine to load only that machine's images, or omit to load all.
 */
export function useImageUrlsForMachines(
  checklistId: string | undefined,
  machines: { categories: { items: { images?: string[] }[] }[] }[],
  activeMachine?: number,
) {
  const { imageUrls, loadMissing } = useImageUrls(checklistId);

  useEffect(() => {
    if (!machines.length) return;
    let keys: string[];
    if (activeMachine !== undefined) {
      const machine = machines[activeMachine];
      if (!machine) return;
      keys = machine.categories.flatMap(c => c.items.flatMap(i => i.images || []));
    } else {
      keys = machines.flatMap(m => m.categories.flatMap(c => c.items.flatMap(i => i.images || [])));
    }
    loadMissing(keys);
  }, [machines, activeMachine, loadMissing]);

  return imageUrls;
}
