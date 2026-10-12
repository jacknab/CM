/**
 * The salon's local database on this tablet: one encrypted SQLite file owned by the app.
 *
 * The web screens (the /nail POS) keep their offline data here instead of in the browser's own
 * storage, which Android may clear when the device is short of space. It holds the same four
 * groups the web code already uses — the last answers from the server, what staff made while
 * offline, the queue of changes still to send, and a few counters — as rows of
 * (store, key, value).
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
        'CREATE TABLE IF NOT EXISTS kv (store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (store, key)) WITHOUT ROWID;',
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
  | { op: 'batch'; writes: LocalDbWrite[] };

function checkStore(store: unknown): string {
  if (typeof store !== 'string' || !STORES.has(store)) throw new Error('Unknown store');
  return store;
}

/** Runs one request from the web screens. Values travel as JSON text and are stored as they are. */
export async function runLocalDb(req: LocalDbRequest): Promise<unknown> {
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
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const w of writes) {
          if (w.value === null) await tx.runAsync('DELETE FROM kv WHERE store = ? AND key = ?', [w.store, w.key]);
          else await tx.runAsync('INSERT INTO kv (store, key, value) VALUES (?, ?, ?) ON CONFLICT (store, key) DO UPDATE SET value = excluded.value', [w.store, w.key, w.value]);
        }
      });
      return null;
    }
    default:
      throw new Error('Unknown request');
  }
}
