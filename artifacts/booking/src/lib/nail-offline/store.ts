/**
 * Where the /nail screen's offline data lives on the device: one IndexedDB database, `certxa_nail_offline`.
 *
 *   cache    last good answer of each read (/api/nail/board, a service's nail options, the turn line…)
 *   records  what staff made while the server was out of reach: clients, walk-ins, tickets (with their lines)
 *   ops      the queue of changes still to be sent, each with its own never-changing idempotency key
 *   meta     small counters
 *
 * The engine only talks to the `KV` interface below, so the same code runs against IndexedDB on the tablet
 * and against a plain in-memory map in the automated tests.
 */
export type StoreName = "cache" | "records" | "ops" | "meta";
export interface Write { store: StoreName; key: string; value: unknown | undefined } // undefined = delete

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  keys(store: StoreName): Promise<string[]>;
  /** All the writes happen together or not at all. */
  batch(writes: Write[]): Promise<void>;
}

const STORES: StoreName[] = ["cache", "records", "ops", "meta"];
const DB_NAME = "certxa_nail_offline";
const DB_VERSION = 1;

export function indexedDbKV(): KV {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
    req.onsuccess = () => {
      // Another tab upgrading the database must not be blocked by this connection.
      req.result.onversionchange = () => { req.result.close(); opening = null; };
      resolve(req.result);
    };
    req.onerror = () => { opening = null; reject(req.error); };
  }));
  const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  return {
    async get<T>(store: StoreName, key: string) { return done((await open()).transaction(store).objectStore(store).get(key)) as Promise<T | undefined>; },
    async getAll<T>(store: StoreName) { return done((await open()).transaction(store).objectStore(store).getAll()) as Promise<T[]>; },
    async keys(store: StoreName) { return (await done((await open()).transaction(store).objectStore(store).getAllKeys())).map(String); },
    async batch(writes: Write[]) {
      if (!writes.length) return;
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([...new Set(writes.map((w) => w.store))], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("The device could not save this"));
        for (const w of writes) {
          if (w.value === undefined) tx.objectStore(w.store).delete(w.key);
          else tx.objectStore(w.store).put(w.value, w.key);
        }
      });
    },
  };
}

/** The same contract in memory — for tests. `data` can be handed to a second instance to play "the app was restarted". */
export function memoryKV(data: Record<StoreName, Map<string, unknown>> = { cache: new Map(), records: new Map(), ops: new Map(), meta: new Map() }): KV & { data: typeof data } {
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    data,
    async get<T>(store: StoreName, key: string) { return clone(data[store].get(key)) as T | undefined; },
    async getAll<T>(store: StoreName) { return [...data[store].values()].map(clone) as T[]; },
    async keys(store: StoreName) { return [...data[store].keys()]; },
    async batch(writes: Write[]) {
      for (const w of writes) {
        if (w.value === undefined) data[w.store].delete(w.key);
        else data[w.store].set(w.key, clone(w.value));
      }
    },
  };
}
