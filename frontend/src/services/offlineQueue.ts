const DB_NAME = 'gallo-offline-queue';
const STORE_NAME = 'saves';
const DB_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface QueuedSave {
  id?: number;
  checklistId: string;
  machineIdx: number;
  machine: unknown;
  version: number;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueSave(save: Omit<QueuedSave, 'id' | 'timestamp'>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.add({ ...save, timestamp: Date.now() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getQueuedSaves(): Promise<QueuedSave[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      const now = Date.now();
      // Filter out expired entries
      const valid = (request.result as QueuedSave[]).filter(
        (s) => now - s.timestamp < TTL_MS
      );
      resolve(valid);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function removeSave(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function clearExpired(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  let cleared = 0;
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const now = Date.now();
      for (const item of request.result as QueuedSave[]) {
        if (now - item.timestamp >= TTL_MS && item.id) {
          store.delete(item.id);
          cleared++;
        }
      }
      tx.oncomplete = () => { db.close(); resolve(cleared); };
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.count();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
