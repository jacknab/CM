const DB_NAME = "certxa_sync_state";
const DB_VERSION = 1;
const STORE_NAME = "state";

export type PendingBatchRecord = {
  batch_id: string;
  action_ids: string[];
  started_at: number;
};

export type SyncStateRecord = {
  key: string;
  last_batch_id: string | null;
  last_confirmed_index: number;
  last_sync_ts: number;
  pending_batch: PendingBatchRecord | null;
};

const STATE_KEY = "sync_state";

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getState(): Promise<SyncStateRecord> {
  const db = await openDB();
  return new Promise((resolve) => {
    const t = db.transaction(STORE_NAME, "readonly");
    const req = t.objectStore(STORE_NAME).get(STATE_KEY);
    req.onsuccess = () => {
      resolve(
        req.result ?? {
          key: STATE_KEY,
          last_batch_id: null,
          last_confirmed_index: -1,
          last_sync_ts: 0,
          pending_batch: null,
        }
      );
    };
    req.onerror = () =>
      resolve({
        key: STATE_KEY,
        last_batch_id: null,
        last_confirmed_index: -1,
        last_sync_ts: 0,
        pending_batch: null,
      });
  });
}

async function putState(updates: Partial<Omit<SyncStateRecord, "key">>): Promise<void> {
  const current = await getState();
  const next: SyncStateRecord = { ...current, ...updates };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, "readwrite");
    t.objectStore(STORE_NAME).put(next);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export const syncStateDB = {
  getState,

  async getLastConfirmedIndex(): Promise<{ batchId: string | null; index: number }> {
    const s = await getState();
    return { batchId: s.last_batch_id, index: s.last_confirmed_index };
  },

  async saveConfirmedIndex(batchId: string, index: number): Promise<void> {
    await putState({ last_batch_id: batchId, last_confirmed_index: index, last_sync_ts: Date.now() });
  },

  async savePendingBatch(batchId: string, actionIds: string[]): Promise<void> {
    await putState({ pending_batch: { batch_id: batchId, action_ids: actionIds, started_at: Date.now() } });
  },

  async clearPendingBatch(): Promise<void> {
    await putState({ pending_batch: null });
  },

  async getPendingBatch(): Promise<PendingBatchRecord | null> {
    const s = await getState();
    return s.pending_batch;
  },

  async reset(): Promise<void> {
    await putState({
      last_batch_id: null,
      last_confirmed_index: -1,
      last_sync_ts: 0,
      pending_batch: null,
    });
  },
};
