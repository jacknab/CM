const DB_NAME = "certxa_local_clients";
const DB_VERSION = 1;
const STORE_NAME = "local_clients";

export type LocalClient = {
  _id: string;
  _isLocal: true;
  _tempId: string;
  _syncedRealId?: number;
  storeId: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt: string;
};

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const s = db.createObjectStore(STORE_NAME, { keyPath: "_id" });
        s.createIndex("storeId", "storeId", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
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

export const localClientsDB = {
  async add(client: LocalClient): Promise<void> {
    await txOne<IDBValidKey>("readwrite", (s) => s.put(client));
  },

  async getAll(storeId: number): Promise<LocalClient[]> {
    const all = await txAll<LocalClient>("readonly", (s) => s.getAll()).catch((): LocalClient[] => []);
    return all.filter((c) => c.storeId === storeId && !c._syncedRealId);
  },

  async getById(tempId: string): Promise<LocalClient | null> {
    const result = await txOne<LocalClient | undefined>("readonly", (s) => s.get(tempId)).catch(() => undefined);
    return result ?? null;
  },

  async markSynced(tempId: string, realId: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const s = t.objectStore(STORE_NAME);
      const req = s.get(tempId);
      req.onsuccess = () => {
        const existing = req.result;
        if (existing) s.put({ ...existing, _syncedRealId: realId });
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async search(storeId: number, query: string): Promise<LocalClient[]> {
    const all = await this.getAll(storeId);
    const q = query.toLowerCase().trim();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  },
};
