// Client-side mirror of the server's "Consideration Lock" (routes.ts,
// getTurnEligibility / assign-walkin's dequeOrder+lockedStaffIds bookkeeping).
//
// While offline, the server can't run that bookkeeping in real time, so a
// second walk-in created on the SAME device moments after the first would
// otherwise recompute eligibility from the same stale snapshot and pick the
// identical "next" tech. This store is a short-lived, per-device ledger of
// "who did this device already claim while offline" — computeOfflineTurnEligibility
// (turn-offline.ts) excludes any staffId with an active claim here, the same
// way it excludes server-locked staff.
//
// Lifecycle: cleared in full once syncEngine.runSync() has applied the
// queued TURN_ASSIGN actions server-side (see SnapshotProvider.tsx's
// reconnect handler) — at that point the server's own lockedStaffIds is the
// source of truth again. An individual claim is also released early if its
// walk-in gets cancelled while still offline.

const DB_NAME = "certxa_turn_claims";
const DB_VERSION = 1;
const STORE_NAME = "claims";

export type TurnClaim = {
  id: string;
  storeId: number;
  staffId: number;
  tempApptId: string;
  claimedAt: number;
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
        s.createIndex("storeId", "storeId", { unique: false });
        s.createIndex("tempApptId", "tempApptId", { unique: false });
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

export const turnClaimsDB = {
  async add(claim: Omit<TurnClaim, "id">): Promise<TurnClaim> {
    const record: TurnClaim = {
      ...claim,
      id: `claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      t.objectStore(STORE_NAME).put(record);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return record;
  },

  async getActiveForStore(storeId: number): Promise<TurnClaim[]> {
    const all = await txAll<TurnClaim>("readonly", (s) => s.getAll());
    return all.filter((c) => c.storeId === storeId);
  },

  /** Attach the real (or provisional) appointment temp id to an existing claim, once known. */
  async tagClaim(claimId: string, tempApptId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      const req = store.get(claimId);
      req.onsuccess = () => {
        const existing = req.result;
        if (!existing) return resolve();
        store.put({ ...existing, tempApptId });
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async removeByTempApptId(tempApptId: string): Promise<void> {
    const all = await txAll<TurnClaim>("readonly", (s) => s.getAll());
    const matching = all.filter((c) => c.tempApptId === tempApptId);
    if (matching.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      for (const claim of matching) store.delete(claim.id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async clearForStore(storeId: number): Promise<void> {
    const all = await txAll<TurnClaim>("readonly", (s) => s.getAll());
    const matching = all.filter((c) => c.storeId === storeId);
    if (matching.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_NAME, "readwrite");
      const store = t.objectStore(STORE_NAME);
      for (const claim of matching) store.delete(claim.id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
