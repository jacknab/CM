import { getDeviceId } from "./device-id";

const DB_NAME = "certxa_actions";
const DB_VERSION = 1;
const STORE_NAME = "actions";

export type ActionType =
  | "CREATE_BOOKING"
  | "UPDATE_BOOKING"
  | "CANCEL_BOOKING"
  | "CHECKIN"
  | "CHECKOUT"
  | "WALKIN"
  | "ASSIGN_STAFF"
  | "CREATE_CLIENT"
  | "UPDATE_CLIENT"
  | "LOYALTY_ADJUST"
  | "TIMECLOCK_PUNCH"
  | "TURN_ASSIGN"
  | "TURN_LOG_OVERRIDE";

export type ActionState = "PENDING" | "SYNCING" | "CONFIRMED" | "CONFLICT";

export type SyncAction = {
  id: string;
  type: ActionType;
  state: ActionState;
  entity_temp_id: string;
  entity_real_id?: number | null;
  payload: Record<string, unknown>;
  timestamp: number;
  idempotency_key: string;
  device_id: string;
  sequence_index: number;
  attempts: number;
  conflict?: string;
  synced_at?: string;
  entity_fingerprint?: string;
};

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const s = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        s.createIndex("state", "state", { unique: false });
        s.createIndex("sequence_index", "sequence_index", { unique: false });
        s.createIndex("type", "type", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function txAll<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T[]>): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE_NAME, mode);
        const req = fn(t.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      })
  );
}

function txOne<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE_NAME, mode);
        const req = fn(t.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const actionQueueDB = {
  async add(action: Omit<SyncAction, "id" | "state" | "attempts" | "device_id" | "sequence_index"> & Partial<Pick<SyncAction, "device_id" | "sequence_index">>): Promise<SyncAction> {
    const record: SyncAction = {
      ...action,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      state: "PENDING",
      attempts: 0,
      device_id: action.device_id ?? getDeviceId(),
      sequence_index: action.sequence_index ?? Date.now(),
    };
    await txOne<IDBValidKey>("readwrite", (s) => s.put(record));
    return record;
  },

  async getAll(): Promise<SyncAction[]> {
    return txAll<SyncAction>("readonly", (s) => s.getAll());
  },

  async getPending(): Promise<SyncAction[]> {
    const all = await this.getAll();
    return all
      .filter((a) => a.state === "PENDING")
      .sort((a, b) => a.sequence_index - b.sequence_index || a.timestamp - b.timestamp);
  },

  async setState(id: string, state: ActionState, extra?: Partial<SyncAction>): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const existing = req.result;
        if (!existing) return resolve();
        const updated = { ...existing, state, ...extra };
        store.put(updated);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async setStates(ids: string[], state: ActionState): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      let remaining = ids.length;
      if (remaining === 0) return resolve();
      for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = () => {
          const existing = req.result;
          if (existing) store.put({ ...existing, state });
          remaining--;
          if (remaining === 0) resolve();
        };
        req.onerror = () => reject(req.error);
      }
      t.onerror = () => reject(t.error);
    });
  },

  async applyMappings(mappings: Record<string, number>): Promise<void> {
    const all = await this.getAll();
    const toUpdate = all.filter(
      (a) => a.entity_temp_id && mappings[a.entity_temp_id] != null && !a.entity_real_id
    );
    if (toUpdate.length === 0) return;

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      for (const action of toUpdate) {
        store.put({
          ...action,
          entity_real_id: mappings[action.entity_temp_id],
          state: "CONFIRMED",
          synced_at: new Date().toISOString(),
        });
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async incrementAttempts(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const existing = req.result;
        if (!existing) return resolve();
        store.put({ ...existing, attempts: existing.attempts + 1, state: "PENDING" });
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async clearConfirmed(): Promise<void> {
    const all = await this.getAll();
    const confirmed = all.filter((a) => a.state === "CONFIRMED");
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      for (const action of confirmed) store.delete(action.id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async clear(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      t.objectStore(STORE_NAME).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async getPendingCount(): Promise<number> {
    const pending = await this.getPending();
    return pending.length;
  },

  async discardByTempId(entityTempId: string): Promise<void> {
    const all = await this.getAll();
    const matching = all.filter((a) => a.entity_temp_id === entityTempId);
    if (matching.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      for (const action of matching) store.delete(action.id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  /** Discard all CONFLICT-state actions whose payload.id or entity_real_id matches a real appointment ID. */
  async discardConflictsByRealId(realId: number): Promise<void> {
    const all = await this.getAll();
    const matching = all.filter(
      (a) =>
        a.state === "CONFLICT" &&
        ((typeof a.payload?.id === "number" && a.payload.id === realId) ||
          a.entity_real_id === realId),
    );
    if (matching.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      for (const action of matching) store.delete(action.id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
