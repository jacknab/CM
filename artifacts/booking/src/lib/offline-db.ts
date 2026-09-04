import { getDeviceId } from "./device-id";

const DB_NAME = "certxa_offline";
const DB_VERSION = 2;

export type QueueRecord = {
  id: string;
  serverId?: number;
  customerName: string;
  customerPhone?: string;
  status: "waiting" | "called" | "serving" | "completed" | "cancelled";
  type: "walkin" | "booking";
  storeId?: number;
  notes?: string;
  partySize?: number;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PendingOp = {
  id: string;
  type: "create_queue" | "update_queue" | "delete_queue" | "queue_next";
  payload: Record<string, unknown>;
  idempotencyKey: string;
  deviceId: string;
  sequenceIndex: number;
  createdAt: string;
  attempts: number;
};

type Stores = {
  queue: QueueRecord;
  pendingOps: PendingOp;
};

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("queue")) {
        const store = db.createObjectStore("queue", { keyPath: "id" });
        store.createIndex("storeId", "storeId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("pendingOps")) {
        const ops = db.createObjectStore("pendingOps", { keyPath: "id" });
        ops.createIndex("createdAt", "createdAt", { unique: false });
        ops.createIndex("sequenceIndex", "sequenceIndex", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  storeName: keyof Stores,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => {};
        req.onerror = () => reject(req.error);
        t.oncomplete = () => resolve(req.result);
        t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
      })
  );
}

function txAll<T>(
  storeName: keyof Stores,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T[]>
): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => {};
        req.onerror = () => reject(req.error);
        t.oncomplete = () => resolve(req.result ?? []);
        t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
      })
  );
}

function clearStore(storeName: keyof Stores): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, "readwrite");
        const store = t.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => {};
        req.onerror = () => reject(req.error);
        t.oncomplete = () => resolve();
        t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
      })
  );
}

export const offlineDB = {
  async getAllQueue(): Promise<QueueRecord[]> {
    return txAll<QueueRecord>("queue", "readonly", (s) => s.getAll());
  },

  async getTodayQueue(storeId: number): Promise<QueueRecord[]> {
    const all = await txAll<QueueRecord>("queue", "readonly", (s) => s.getAll());
    const today = new Date().toDateString();
    return all.filter(
      (r) =>
        r.storeId === storeId &&
        new Date(r.createdAt).toDateString() === today &&
        r.status !== "cancelled"
    );
  },

  async putQueue(record: QueueRecord): Promise<void> {
    await tx<IDBValidKey>("queue", "readwrite", (s) => s.put(record));
  },

  async deleteQueue(id: string): Promise<void> {
    await tx<undefined>("queue", "readwrite", (s) => s.delete(id));
  },

  async clearQueue(): Promise<void> {
    await clearStore("queue");
  },

  async updateQueueRecord(
    id: string,
    updates: Partial<QueueRecord>
  ): Promise<void> {
    const existing = await tx<QueueRecord | undefined>("queue", "readonly", (s) =>
      s.get(id)
    );
    if (!existing) return;
    await tx<IDBValidKey>("queue", "readwrite", (s) =>
      s.put({ ...existing, ...updates, updatedAt: new Date().toISOString() })
    );
  },

  async mergeServerQueue(serverEntries: ServerEntry[], storeId: number): Promise<void> {
    const db = await openDB();
    const t = db.transaction("queue", "readwrite");
    const store = t.objectStore("queue");

    const allReq = store.getAll();
    await new Promise<void>((resolve, reject) => {
      allReq.onsuccess = () => resolve();
      allReq.onerror = () => reject(allReq.error);
    });
    const all: QueueRecord[] = allReq.result ?? [];

    const localByServerId = new Map(
      all.filter((r) => r.serverId != null).map((r) => [r.serverId!, r])
    );

    for (const se of serverEntries) {
      const existingByServerId = localByServerId.get(se.id);
      if (existingByServerId) {
        if (existingByServerId.synced) {
          store.put({
            ...existingByServerId,
            status: se.status as QueueRecord["status"],
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        const record: QueueRecord = {
          id: `server_${se.id}`,
          serverId: se.id,
          customerName: se.customerName,
          customerPhone: se.customerPhone ?? undefined,
          status: se.status as QueueRecord["status"],
          type: "walkin",
          storeId,
          notes: se.notes ?? undefined,
          partySize: se.partySize ?? 1,
          synced: true,
          createdAt: se.createdAt,
          updatedAt: se.createdAt,
        };
        store.put(record);
      }
    }

    const serverIds = new Set(serverEntries.map((se) => se.id));
    for (const local of all) {
      if (local.synced && local.serverId != null && !serverIds.has(local.serverId)) {
        store.delete(local.id);
      }
    }

    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async getAllPendingOps(): Promise<PendingOp[]> {
    const all = await txAll<PendingOp>("pendingOps", "readonly", (s) => s.getAll());
    return all.sort((a, b) => a.sequenceIndex - b.sequenceIndex || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  async addPendingOp(
    op: Omit<PendingOp, "id" | "createdAt" | "attempts" | "deviceId" | "sequenceIndex">
    & Partial<Pick<PendingOp, "deviceId" | "sequenceIndex">>
  ): Promise<void> {
    const record: PendingOp = {
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      deviceId: op.deviceId ?? getDeviceId(),
      sequenceIndex: op.sequenceIndex ?? Date.now(),
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    await tx<IDBValidKey>("pendingOps", "readwrite", (s) => s.put(record));
  },

  async deletePendingOp(id: string): Promise<void> {
    await tx<undefined>("pendingOps", "readwrite", (s) => s.delete(id));
  },

  async clearPendingOps(): Promise<void> {
    await clearStore("pendingOps");
  },

  async incrementOpAttempts(id: string): Promise<void> {
    const op = await tx<PendingOp | undefined>("pendingOps", "readonly", (s) =>
      s.get(id)
    );
    if (!op) return;
    await tx<IDBValidKey>("pendingOps", "readwrite", (s) =>
      s.put({ ...op, attempts: op.attempts + 1 })
    );
  },

  async replaceTempId(tempId: string, serverId: number): Promise<void> {
    const record = await tx<QueueRecord | undefined>("queue", "readonly", (s) =>
      s.get(tempId)
    );
    if (!record) return;
    const updated: QueueRecord = {
      ...record,
      id: `server_${serverId}`,
      serverId,
      synced: true,
      updatedAt: new Date().toISOString(),
    };
    const db = await openDB();
    const t = db.transaction("queue", "readwrite");
    const store = t.objectStore("queue");
    store.delete(tempId);
    store.put(updated);
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

export type ServerEntry = {
  id: number;
  customerName: string;
  customerPhone?: string | null;
  status: string;
  notes?: string | null;
  partySize?: number | null;
  createdAt: string;
};
