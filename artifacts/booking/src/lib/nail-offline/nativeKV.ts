/**
 * The tablet's encrypted SQLite database, reached through the Certxa Android app.
 *
 * Inside the app (builds 1.0.2 and later) the /nail screen keeps its offline data in a database file the
 * app owns, instead of the browser's own storage, which Android may clear when the device runs short of
 * space. The app answers each request under the id it was sent with; values travel as JSON text.
 * In a normal browser, or an older build of the app, none of this exists and IndexedDB is used as before.
 */
import type { KV, StoreName, Write } from "./store";

interface NativeWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
  CERTXA_NATIVE_LOCAL_DB?: number;
  __certxaLocalDbReply?: (json: string) => void;
}

const REPLY_TIMEOUT_MS = 15_000;

export function hasNativeDb(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as NativeWindow;
  return !!w.ReactNativeWebView && !!w.CERTXA_NATIVE_LOCAL_DB;
}

type Send = (request: Record<string, unknown>) => Promise<unknown>;

/** Sends requests to the app and matches each answer to its request. */
export function nativeSend(): Send {
  const w = window as unknown as NativeWindow;
  const waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let seq = 0;
  w.__certxaLocalDbReply = (json: string) => {
    let reply: { id?: string; ok?: boolean; result?: unknown; error?: string };
    try { reply = JSON.parse(json); } catch { return; }
    const entry = reply.id != null ? waiting.get(reply.id) : undefined;
    if (!entry) return;
    waiting.delete(reply.id!);
    clearTimeout(entry.timer);
    if (reply.ok) entry.resolve(reply.result);
    else entry.reject(new Error(reply.error || "The tablet's database refused the request"));
  };
  return (request) =>
    new Promise((resolve, reject) => {
      const id = `db${Date.now().toString(36)}-${++seq}`;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error("The tablet's database did not answer"));
      }, REPLY_TIMEOUT_MS);
      waiting.set(id, { resolve, reject, timer });
      w.ReactNativeWebView!.postMessage(JSON.stringify({ type: "LOCAL_DB", id, request }));
    });
}

/** The `KV` the offline engine uses, kept in the app's database. `send` is injectable for tests. */
export function nativeSqliteKV(send: Send = nativeSend()): KV {
  const parse = <T>(text: unknown): T | undefined => (typeof text === "string" ? (JSON.parse(text) as T) : undefined);
  return {
    async get<T>(store: StoreName, key: string) { return parse<T>(await send({ op: "get", store, key })); },
    async getAll<T>(store: StoreName) { return ((await send({ op: "getAll", store })) as string[]).map((t) => JSON.parse(t) as T); },
    async keys(store: StoreName) { return (await send({ op: "keys", store })) as string[]; },
    async batch(writes: Write[]) {
      if (!writes.length) return;
      await send({ op: "batch", writes: writes.map((w) => ({ store: w.store, key: w.key, value: w.value === undefined ? null : JSON.stringify(w.value) })) });
    },
  };
}

const STORES: StoreName[] = ["cache", "records", "ops", "meta"];
const MOVED_KEY = "movedFromBrowserStorage";

/**
 * Copies everything from `from` into `to`, once. Run the first time the app's database is used, so tickets
 * and cash sales still waiting to be sent in the browser's storage are carried over, not left behind.
 * `from` is not emptied: if the move is interrupted it simply runs again.
 */
export async function moveOnce(from: KV, to: KV): Promise<boolean> {
  if (await to.get<boolean>("meta", MOVED_KEY)) return false;
  const writes: Write[] = [];
  for (const store of STORES) {
    const keys = await from.keys(store).catch(() => [] as string[]);
    for (const key of keys) {
      const value = await from.get<unknown>(store, key);
      // Never overwrite something the app's database already holds.
      if (value !== undefined && (await to.get<unknown>(store, key)) === undefined) writes.push({ store, key, value });
    }
  }
  writes.push({ store: "meta", key: MOVED_KEY, value: true });
  await to.batch(writes);
  return true;
}

/**
 * A `KV` over the app's database that first carries over whatever the browser's storage holds, then uses
 * the app's database for everything.
 */
export function movedKV(from: KV, to: KV): KV {
  let ready: Promise<unknown> | null = null;
  const whenReady = () => (ready ??= moveOnce(from, to).catch((err) => { ready = null; throw err; }));
  return {
    async get<T>(store: StoreName, key: string) { await whenReady(); return to.get<T>(store, key); },
    async getAll<T>(store: StoreName) { await whenReady(); return to.getAll<T>(store); },
    async keys(store: StoreName) { await whenReady(); return to.keys(store); },
    async batch(writes: Write[]) { await whenReady(); return to.batch(writes); },
  };
}
