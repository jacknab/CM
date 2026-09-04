const DB_NAME = "certxa_client_phone_cache";
const DB_VERSION = 2;
const STORE_NAME = "clients";

export type CachedBookingClient = {
  cacheKey: string;
  id: number | string;
  storeId: number;
  name: string;
  phone: string | null;
  phone10: string | null;
  _isLocal?: boolean;
  _tempId?: string;
  _syncedRealId?: number;
};

export function normalizePhone10(value?: string | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function cacheKey(storeId: number, id: number | string): string {
  return storeId + ":" + String(id);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const s = db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
        s.createIndex("storeId", "storeId", { unique: false });
        s.createIndex("phone10", "phone10", { unique: false });
      } else {
        // Rewrite v1 records so previously stored profile fields are removed.
        const upgradeTransaction = (e.target as IDBOpenDBRequest).transaction;
        const store = upgradeTransaction?.objectStore(STORE_NAME);
        const request = store?.getAll();
        request?.addEventListener("success", () => {
          for (const record of request.result ?? []) store?.put(toCachedClient(record.storeId, record));
        });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

function toCachedClient(storeId: number, raw: any): CachedBookingClient {
  const id = raw.id ?? raw._tempId;
  const name = raw.name ?? raw.fullName ?? [raw.firstName, raw.lastName].filter(Boolean).join(" ");
  const phone = raw.phone ?? raw.primaryPhone ?? null;
  return {
    cacheKey: cacheKey(storeId, id),
    id,
    storeId,
    name: name ?? "",
    phone: normalizePhone10(phone),
    phone10: normalizePhone10(phone),
    _isLocal: raw._isLocal,
    _tempId: raw._tempId,
    _syncedRealId: raw._syncedRealId,
  };
}

export const clientPhoneCacheDB = {
  async replaceStore(storeId: number, clients: any[]): Promise<void> {
    if (!storeId) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const s = t.objectStore(STORE_NAME);
      const request = s.index("storeId").getAll(storeId);
      request.onsuccess = () => {
        const incomingIds = new Set(clients.map((client) => String(client.id ?? client._tempId)));
        for (const existing of request.result ?? []) {
          if (!existing._isLocal && !incomingIds.has(String(existing.id))) s.delete(existing.cacheKey);
        }
        for (const client of clients) {
          const cached = toCachedClient(storeId, client);
          if (cached.id != null) s.put(cached);
        }
      };
      request.onerror = () => reject(request.error);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
    });
  },

  async putMany(storeId: number, clients: any[]): Promise<void> {
    if (!storeId || clients.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const s = t.objectStore(STORE_NAME);
      for (const client of clients) {
        const cached = toCachedClient(storeId, client);
        if (cached.id != null) s.put(cached);
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async putLocal(storeId: number, client: any): Promise<CachedBookingClient> {
    const cached = toCachedClient(storeId, client);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      t.objectStore(STORE_NAME).put(cached);
      t.oncomplete = () => resolve(cached);
      t.onerror = () => reject(t.error);
    });
  },

  async getAll(storeId: number): Promise<CachedBookingClient[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readonly");
      const req = t.objectStore(STORE_NAME).index("storeId").getAll(storeId);
      req.onsuccess = () => resolve((req.result ?? []) as CachedBookingClient[]);
      req.onerror = () => reject(req.error);
    });
  },

  async getById(storeId: number, id: number | string): Promise<CachedBookingClient | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readonly");
      const req = t.objectStore(STORE_NAME).get(cacheKey(storeId, id));
      req.onsuccess = () => resolve((req.result as CachedBookingClient | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async findByPhone10(storeId: number, phone: string): Promise<CachedBookingClient | null> {
    const phone10 = normalizePhone10(phone);
    if (!phone10) return null;
    const all: CachedBookingClient[] = await this.getAll(storeId).catch(() => [] as CachedBookingClient[]);
    return all.find((client) => client.phone10 === phone10 && !client._syncedRealId) ?? null;
  },

  async markSynced(storeId: number, tempId: string, realId: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const s = t.objectStore(STORE_NAME);
      const req = s.get(cacheKey(storeId, tempId));
      req.onsuccess = () => {
        const existing = req.result as CachedBookingClient | undefined;
        if (existing) s.put({ ...existing, _syncedRealId: realId, updatedAt: new Date().toISOString() });
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
