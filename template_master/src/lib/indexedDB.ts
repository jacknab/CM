/**
 * Simple IndexedDB wrapper for the salon front‑desk offline storage.
 *
 * The wrapper provides basic CRUD operations for a single object store
 * called "bookings". Each record follows the shape required by the
 * specification:
 *
 * ```ts
 * interface BookingRecord {
 *   id: string;               // temporary client ID or server ID
 *   type: 'booking' | 'walkin';
 *   status: 'active' | 'completed';
 *   data: Record<string, any>; // additional booking details
 *   synced: boolean;           // has this record been sent to the server?
 *   created_at: string;        // ISO timestamp
 * }
 * ```
 *
 * The API mirrors the common pattern used throughout the codebase:
 *   - `openDB()` is called lazily on the first operation.
 *   - All methods return Promises.
 *   - Errors are caught and re‑thrown with a clear message so the UI can
 *     decide how to react (offline mode should never crash).
 */

export interface BookingRecord {
  id: string;
  type: 'booking' | 'walkin';
  status: 'active' | 'completed';
  data: Record<string, any>;
  synced: boolean;
  created_at: string;
}

/** Client record stored for offline access */
export interface ClientRecord {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  // additional fields can be added as needed
}

const DB_NAME = 'salon-offline-db';
const STORE_NAME = 'bookings';
const CLIENT_STORE_NAME = 'clients';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Indexes useful for queries
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      store.createIndex('synced', 'synced', { unique: false });
    }
    if (!db.objectStoreNames.contains(CLIENT_STORE_NAME)) {
      const clientStore = db.createObjectStore(CLIENT_STORE_NAME, { keyPath: 'id' });
      clientStore.createIndex('fullName', 'fullName', { unique: false });
      clientStore.createIndex('email', 'email', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** Get a single record by its ID */
export async function getBooking(id: string): Promise<BookingRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as BookingRecord);
    request.onerror = () => reject(request.error);
  });
}

/** Get all bookings, optionally filtered by a predicate */
export async function getAllBookings(
  filter?: (b: BookingRecord) => boolean,
): Promise<BookingRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as BookingRecord[];
      resolve(filter ? all.filter(filter) : all);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Add or replace a booking record */
export async function putBooking(record: BookingRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Delete a booking by ID */
export async function deleteBooking(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Get all cached clients */
export async function getAllClients(): Promise<ClientRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CLIENT_STORE_NAME, 'readonly');
    const store = tx.objectStore(CLIENT_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as ClientRecord[]);
    request.onerror = () => reject(request.error);
  });
}

/** Add or update a client record */
export async function putClient(record: ClientRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CLIENT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CLIENT_STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Delete a client by ID */
export async function deleteClient(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CLIENT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CLIENT_STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Helper to generate a temporary client‑side ID */
export function generateTempId(): string {
  // Using a simple UUID v4 implementation without external deps
  return 'temp_' + crypto.randomUUID();
}
