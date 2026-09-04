const DB_NAME = "certxa_snapshot";
const DB_VERSION = 2;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "business_config";

function normalizePhone10(value?: string | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

export type SnapshotCategory = {
  id: number;
  name: string;
  storeId?: number | null;
  sortOrder?: number | null;
};

export type SnapshotService = {
  id: number;
  name: string;
  description?: string | null;
  duration: number;
  price?: string | number | null;
  category?: string | null;
  categoryId?: number | null;
  storeId?: number | null;
  depositRequired?: boolean | null;
};

export type SnapshotAddon = {
  id: number;
  name: string;
  description?: string | null;
  price?: string | number | null;
  duration?: number | null;
  storeId?: number | null;
};

export type SnapshotStaff = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  color?: string | null;
  status?: string | null;
  employmentType?: string | null;
  storeId?: number | null;
};

export type SnapshotCustomer = {
  id: number;
  name: string;
  phone?: string | null;
  storeId?: number | null;
};

export type SnapshotAppointment = {
  id: number;
  date: string;
  duration: number;
  status?: string | null;
  notes?: string | null;
  serviceId?: number | null;
  staffId?: number | null;
  customerId?: number | null;
  storeId?: number | null;
  totalPaid?: string | null;
  tipAmount?: string | null;
};

export type SnapshotStaffAvailability = {
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type SnapshotBusinessHours = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

export type SnapshotTimeclockEntry = {
  staffId: number;
  clockIn: string;
  clockOut: string | null;
  workDate: string;
};

export type SnapshotStaffService = {
  staffId: number;
  serviceId: number;
};

// Mirrors getTurnPreferences()'s return shape (artifacts/api-server/src/routes.ts) —
// shipped as a whole object rather than hand-picked fields so client/server can't
// drift on which fields exist.
export type SnapshotTurnSettings = {
  turnEnabled: boolean;
  autoAdvanceOnCheckout: boolean;
  useClockInOrder: boolean;
  allowManagerOverrides: boolean;
  turnValueThreshold: number;
  appointmentExclusionWindowMinutes: number;
  dequeOrder: number[];
  lockedStaffIds: number[];
  shortTurnProtectedId: number | null;
  pausedStaffIds?: number[];
};

export type BusinessSnapshot = {
  version: string;
  generatedAt: string;
  storeId: number;
  categories: SnapshotCategory[];
  services: SnapshotService[];
  addons: SnapshotAddon[];
  staff: SnapshotStaff[];
  customers: SnapshotCustomer[];
  appointments?: SnapshotAppointment[];
  storeHours?: SnapshotBusinessHours[];
  staffAvailability?: SnapshotStaffAvailability[];
  timeclock?: SnapshotTimeclockEntry[];
  staffServices?: SnapshotStaffService[];
  turnSettings?: SnapshotTurnSettings;
  timezone?: string;
};

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      } else {
        const upgradeTransaction = (e.target as IDBOpenDBRequest).transaction;
        const store = upgradeTransaction?.objectStore(STORE_NAME);
        const request = store?.getAll();
        request?.addEventListener("success", () => {
          for (const record of request.result ?? []) {
            const customers = (record.customers ?? []).map((customer: any) => ({
              id: customer.id,
              name: customer.name ?? "",
              phone: normalizePhone10(customer.phone),
              storeId: customer.storeId ?? record.storeId,
            }));
            store?.put({ ...record, customers });
          }
        });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

export const snapshotDB = {
  async save(snapshot: BusinessSnapshot): Promise<void> {
    const sanitizedSnapshot = {
      ...snapshot,
      customers: snapshot.customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: normalizePhone10(customer.phone),
        storeId: customer.storeId ?? snapshot.storeId,
      })),
    };
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      const req = store.put({ key: `${SNAPSHOT_KEY}_${sanitizedSnapshot.storeId}`, ...sanitizedSnapshot });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async load(storeId: number): Promise<BusinessSnapshot | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readonly");
      const store = t.objectStore(STORE_NAME);
      const req = store.get(`${SNAPSHOT_KEY}_${storeId}`);
      req.onsuccess = () => {
        const result = req.result;
        if (!result) return resolve(null);
        const { key: _key, ...snapshot } = result;
        resolve({
          ...snapshot,
          customers: (snapshot.customers ?? []).map((customer: any) => ({
            id: customer.id,
            name: customer.name ?? "",
            phone: normalizePhone10(customer.phone),
            storeId: customer.storeId ?? snapshot.storeId,
          })),
        } as BusinessSnapshot);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getVersion(storeId: number): Promise<string | null> {
    try {
      const snap = await this.load(storeId);
      return snap?.version ?? null;
    } catch {
      return null;
    }
  },
};
