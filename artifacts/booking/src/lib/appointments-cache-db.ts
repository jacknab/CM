const DB_NAME = "certxa_appt_cache";
const DB_VERSION = 1;

export type LocalBooking = {
  _id: string;
  _isLocal: true;
  _tempId: string;
  _syncedRealId?: number;
  storeId: number;
  date: string;
  duration: number;
  serviceId: number | null;
  staffId: number | null;
  customerId: number | string | null;
  customerName?: string;
  serviceName?: string;
  staffName?: string;
  staffColor?: string;
  notes?: string;
  status: string;
  type?: string;
  createdAt: string;
};

type DayCache = {
  key: string;
  storeId: number;
  fromDate: string;
  toDate: string;
  appointments: any[];
  cachedAt: number;
};

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("day_cache")) {
        const s = db.createObjectStore("day_cache", { keyPath: "key" });
        s.createIndex("storeId", "storeId", { unique: false });
      }
      if (!db.objectStoreNames.contains("local_bookings")) {
        const s = db.createObjectStore("local_bookings", { keyPath: "_id" });
        s.createIndex("storeId", "storeId", { unique: false });
        s.createIndex("date", "date", { unique: false });
        s.createIndex("storeId_date", ["storeId", "date"], { unique: false });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function txOne<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function txAll<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T[]>
): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      })
  );
}

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const appointmentsCacheDB = {
  async cacheAppointments(
    storeId: number,
    fromDate: string,
    toDate: string,
    appointments: any[]
  ): Promise<void> {
    const key = `${storeId}:${fromDate}:${toDate}`;
    const record: DayCache = {
      key,
      storeId,
      fromDate,
      toDate,
      appointments,
      cachedAt: Date.now(),
    };
    await txOne<IDBValidKey>("day_cache", "readwrite", (s) => s.put(record));
  },

  async getCachedAppointments(
    storeId: number,
    fromDate: string,
    toDate: string
  ): Promise<any[]> {
    const key = `${storeId}:${fromDate}:${toDate}`;
    const record = await txOne<DayCache | undefined>("day_cache", "readonly", (s) =>
      s.get(key)
    ).catch(() => undefined);

    if (!record) return [];
    if (Date.now() - record.cachedAt > CACHE_MAX_AGE_MS) return [];
    return record.appointments ?? [];
  },

  async getCachedForAnyRange(storeId: number): Promise<any[]> {
    const all = await txAll<DayCache>("day_cache", "readonly", (s) => s.getAll()).catch((): DayCache[] => []);
    const fresh = all.filter(
      (r) => r.storeId === storeId && Date.now() - r.cachedAt < CACHE_MAX_AGE_MS
    );
    const seen = new Set<number>();
    const merged: any[] = [];
    for (const r of fresh) {
      for (const apt of r.appointments) {
        if (!seen.has(apt.id)) {
          seen.add(apt.id);
          merged.push(apt);
        }
      }
    }
    return merged;
  },

  async addLocalBooking(booking: LocalBooking): Promise<void> {
    await txOne<IDBValidKey>("local_bookings", "readwrite", (s) => s.put(booking));
  },

  async getLocalBookings(storeId: number): Promise<LocalBooking[]> {
    return txAll<LocalBooking>("local_bookings", "readonly", (s) => s.getAll()).then((all) =>
      all.filter((b) => b.storeId === storeId)
    ).catch(() => []);
  },

  async getLocalBookingsForDate(storeId: number, date: string): Promise<LocalBooking[]> {
    const all = await this.getLocalBookings(storeId);
    return all.filter((b) => {
      const bDate = b.date.slice(0, 10);
      return bDate === date;
    });
  },

  async getLocalBookingsForRange(
    storeId: number,
    fromDate: string,
    toDate: string
  ): Promise<LocalBooking[]> {
    const all = await this.getLocalBookings(storeId);
    return all.filter((b) => {
      const bDate = b.date.slice(0, 10);
      return bDate >= fromDate && bDate <= toDate;
    });
  },

  async markLocalBookingSynced(tempId: string, realId: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("local_bookings", "readwrite");
      const s = t.objectStore("local_bookings");
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

  async updateLocalBooking(tempId: string, updates: Partial<LocalBooking>): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("local_bookings", "readwrite");
      const s = t.objectStore("local_bookings");
      const req = s.get(tempId);
      req.onsuccess = () => {
        const existing = req.result as LocalBooking | undefined;
        if (existing) {
          s.put({ ...existing, ...updates });
        }
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async deleteLocalBooking(tempId: string): Promise<void> {
    await txOne<undefined>("local_bookings", "readwrite", (s) => s.delete(tempId));
  },

  async cleanupSyncedLocalBookings(): Promise<void> {
    const all = await txAll<LocalBooking>("local_bookings", "readonly", (s) => s.getAll()).catch((): LocalBooking[] => []);
    const toDelete = all.filter((b) => b._syncedRealId != null);
    if (toDelete.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("local_bookings", "readwrite");
      const s = t.objectStore("local_bookings");
      for (const b of toDelete) s.delete(b._id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
