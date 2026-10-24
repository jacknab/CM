/**
 * The salon's local database on this tablet: one encrypted SQLite file owned by the app.
 *
 * The web screens (the /nail POS) keep their offline data here instead of in the browser's own
 * storage, which Android may clear when the device is short of space. It holds the same four
 * groups the web code already uses — the last answers from the server, what staff made while
 * offline, the queue of changes still to send, and a few counters — as rows of
 * (store, key, value).
 *
 * It also keeps the salon's account itself (plans/salon-local-database.md): every table the salon uses, copied
 * from the server and kept in sync, one row per (store, table, id) in `mirror`, the row as JSON. The web screens
 * apply the server's changes and read it while offline (`mirror*` requests below).
 *
 * The file is encrypted with SQLCipher. Its key is 32 random bytes made on first use and kept in
 * the Android Keystore through expo-secure-store; it never leaves the device and is not in the
 * app's code.
 */
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DB_FILE = 'certxa-salon.db';
const KEY_NAME = 'certxa.localdb.key';
const STORES = new Set(['cache', 'records', 'ops', 'meta']);
/** Columns of the salon's copied rows that have an index (mirrorFind is fast on these). */
const MIRROR_INDEXED = ['customer_id', 'client_id', 'appointment_id', 'staff_id', 'service_id'];
const NAME = /^[a-z_][a-z0-9_]{0,62}$/;

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function databaseKey(): Promise<string> {
  const saved = await SecureStore.getItemAsync(KEY_NAME);
  if (saved && /^[0-9a-f]{64}$/.test(saved)) return saved;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, hex);
  return hex;
}

function open(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DB_FILE);
    // Must be the first statement on the connection: everything after it reads and writes encrypted pages.
    await db.execAsync(`PRAGMA key = "x'${await databaseKey()}'";`);
    await db.execAsync(
      'PRAGMA journal_mode = WAL;' +
        'CREATE TABLE IF NOT EXISTS kv (store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (store, key)) WITHOUT ROWID;' +
        'CREATE TABLE IF NOT EXISTS mirror (store INTEGER NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (store, tbl, id)) WITHOUT ROWID;' +
        // The columns screens look rows up by.
        MIRROR_INDEXED.map((f) => `CREATE INDEX IF NOT EXISTS mirror_by_${f} ON mirror (store, tbl, json_extract(data, '$.${f}'));`).join('') +
        'CREATE TABLE IF NOT EXISTS mirror_state (store INTEGER PRIMARY KEY, state TEXT NOT NULL);',
    );
    return db;
  })().catch((err) => {
    opening = null;
    throw err;
  });
  return opening;
}

export interface LocalDbWrite {
  store: string;
  key: string;
  /** JSON text; null deletes the row. */
  value: string | null;
}

export type LocalDbRequest =
  | { op: 'hello' }
  | { op: 'get'; store: string; key: string }
  | { op: 'getAll'; store: string }
  | { op: 'keys'; store: string }
  | { op: 'batch'; writes: LocalDbWrite[] }
  // The salon's copied account. Rows travel as JSON text.
  | { op: 'mirrorApply'; store: number; upserts?: { tbl: string; id: string; data: string }[]; deletes?: { tbl: string; id: string }[];
      deleteWhere?: { tbl: string; field: string; value: string | number }[]; state?: string; clear?: boolean }
  | { op: 'mirrorGet'; store: number; tbl: string; id: string }
  | { op: 'mirrorFind'; store: number; tbl: string; field: string; value: string | number; limit?: number }
  | { op: 'mirrorAll'; store: number; tbl: string }
  | { op: 'mirrorCount'; store: number }
  | { op: 'mirrorState'; store: number };

function checkName(name: unknown): string {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('Bad table or column name');
  return name;
}
function checkMirrorStore(store: unknown): number {
  const n = Number(store);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Bad salon');
  return n;
}

function checkStore(store: unknown): string {
  if (typeof store !== 'string' || !STORES.has(store)) throw new Error('Unknown store');
  return store;
}

/**
 * A transaction on the one open (unlocked) connection. Not expo-sqlite's withExclusiveTransactionAsync: that opens a
 * NEW connection to the file, which never gets the SQLCipher key, so every write failed with "file is not a database"
 * (owner bug 2026-10-24: "Salon data on this tablet: not copied yet" — the copy's first write failed every minute, and
 * the offline store fell back to browser storage). Requests run one at a time (runLocalDb), so nothing else can run
 * inside a transaction.
 */
async function inTransaction(db: SQLite.SQLiteDatabase, task: (tx: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await task(db);
    await db.execAsync('COMMIT');
  } catch (err) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw err;
  }
}

let queue: Promise<unknown> = Promise.resolve();
/** One request at a time on the shared connection, in the order they arrive. */
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Runs one request from the web screens. Values travel as JSON text and are stored as they are. */
export function runLocalDb(req: LocalDbRequest): Promise<unknown> {
  return oneAtATime(() => runLocalDbNow(req));
}

async function runLocalDbNow(req: LocalDbRequest): Promise<unknown> {
  const db = await open();
  switch (req.op) {
    case 'hello':
      return { ok: true };
    case 'get': {
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE store = ? AND key = ?', [
        checkStore(req.store),
        String(req.key),
      ]);
      return row ? row.value : null;
    }
    case 'getAll': {
      const rows = await db.getAllAsync<{ value: string }>('SELECT value FROM kv WHERE store = ? ORDER BY key', [checkStore(req.store)]);
      return rows.map((r) => r.value);
    }
    case 'keys': {
      const rows = await db.getAllAsync<{ key: string }>('SELECT key FROM kv WHERE store = ? ORDER BY key', [checkStore(req.store)]);
      return rows.map((r) => r.key);
    }
    case 'batch': {
      if (!Array.isArray(req.writes)) throw new Error('Bad batch');
      const writes = req.writes.map((w) => ({ store: checkStore(w.store), key: String(w.key), value: w.value }));
      // All the writes happen together or not at all.
      await inTransaction(db, async (tx) => {
        for (const w of writes) {
          if (w.value === null) await tx.runAsync('DELETE FROM kv WHERE store = ? AND key = ?', [w.store, w.key]);
          else await tx.runAsync('INSERT INTO kv (store, key, value) VALUES (?, ?, ?) ON CONFLICT (store, key) DO UPDATE SET value = excluded.value', [w.store, w.key, w.value]);
        }
      });
      return null;
    }
    case 'mirrorApply': {
      const store = checkMirrorStore(req.store);
      // One transaction: a page of changes, and where the sync has got to, are kept together or not at all.
      await inTransaction(db, async (tx) => {
        if (req.clear) await tx.runAsync('DELETE FROM mirror WHERE store = ?', [store]);
        for (const d of req.deletes ?? []) await tx.runAsync('DELETE FROM mirror WHERE store = ? AND tbl = ? AND id = ?', [store, checkName(d.tbl), String(d.id)]);
        // Rows that went with a deleted one (a deleted appointment's add-ons, a deleted client's phones).
        for (const w of req.deleteWhere ?? []) {
          await tx.runAsync(`DELETE FROM mirror WHERE store = ? AND tbl = ? AND json_extract(data, '$.${checkName(w.field)}') = ?`, [store, checkName(w.tbl), w.value]);
        }
        for (const u of req.upserts ?? []) {
          await tx.runAsync('INSERT INTO mirror (store, tbl, id, data) VALUES (?, ?, ?, ?) ON CONFLICT (store, tbl, id) DO UPDATE SET data = excluded.data',
            [store, checkName(u.tbl), String(u.id), String(u.data)]);
        }
        if (typeof req.state === 'string') {
          await tx.runAsync('INSERT INTO mirror_state (store, state) VALUES (?, ?) ON CONFLICT (store) DO UPDATE SET state = excluded.state', [store, req.state]);
        }
        if (req.clear && typeof req.state !== 'string') await tx.runAsync('DELETE FROM mirror_state WHERE store = ?', [store]);
      });
      return null;
    }
    case 'mirrorGet': {
      const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM mirror WHERE store = ? AND tbl = ? AND id = ?',
        [checkMirrorStore(req.store), checkName(req.tbl), String(req.id)]);
      return row ? row.data : null;
    }
    case 'mirrorFind': {
      const limit = Math.min(Math.max(Number(req.limit) || 500, 1), 5000);
      const rows = await db.getAllAsync<{ data: string }>(
        `SELECT data FROM mirror WHERE store = ? AND tbl = ? AND json_extract(data, '$.${checkName(req.field)}') = ? LIMIT ${limit}`,
        [checkMirrorStore(req.store), checkName(req.tbl), req.value]);
      return rows.map((r) => r.data);
    }
    case 'mirrorAll': {
      const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM mirror WHERE store = ? AND tbl = ?', [checkMirrorStore(req.store), checkName(req.tbl)]);
      return rows.map((r) => r.data);
    }
    case 'mirrorCount': {
      const rows = await db.getAllAsync<{ tbl: string; n: number }>('SELECT tbl, COUNT(*) AS n FROM mirror WHERE store = ? GROUP BY tbl', [checkMirrorStore(req.store)]);
      return Object.fromEntries(rows.map((r) => [r.tbl, Number(r.n)]));
    }
    case 'mirrorState': {
      const row = await db.getFirstAsync<{ state: string }>('SELECT state FROM mirror_state WHERE store = ?', [checkMirrorStore(req.store)]);
      return row ? row.state : null;
    }
    default:
      throw new Error('Unknown request');
  }
}

/** For the manager menu: how much of the salon's account this tablet holds, and when it last caught up. */
export async function mirrorSummary(): Promise<{ rows: number; syncedAt: string | null; complete: boolean } | null> {
  try {
    const db = await open();
    const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM mirror');
    const states = await db.getAllAsync<{ state: string }>('SELECT state FROM mirror_state');
    if (!states.length) return null;
    let syncedAt: string | null = null;
    let complete = true;
    for (const { state } of states) {
      try {
        const st = JSON.parse(state);
        if (!st.complete) complete = false;
        if (st.syncedAt && (!syncedAt || st.syncedAt > syncedAt)) syncedAt = st.syncedAt;
      } catch { /* unreadable: shown as not synced */ }
    }
    return { rows: Number(count?.n ?? 0), syncedAt, complete };
  } catch {
    return null;
  }
}
