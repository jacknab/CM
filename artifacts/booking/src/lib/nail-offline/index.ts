/** The /nail offline engine as the browser uses it: IndexedDB for storage, `fetch` for the server. */
import { hasNativeDb, movedKV, offlineStorageInUse, sharedNativeKV } from "./nativeKV";
import { NailOffline, Unreachable, type Reply, type Transport } from "./engine";
import { indexedDbKV } from "./store";

export * from "./engine";

// Inside the Certxa Android app (1.0.2+) the data lives in the app's encrypted SQLite database, after a one-time
// carry-over of whatever the browser's storage held. Everywhere else it stays in IndexedDB.
export const nailOffline = new NailOffline(hasNativeDb() ? movedKV(indexedDbKV(), sharedNativeKV()) : indexedDbKV());

/** The storage the offline engine uses: "app" (the Certxa app's encrypted database), "browser" (IndexedDB — outside
 *  the app, or the app's database failed: `error`), "pending" before first use. */
export const offlineStorage = (): { kind: "app" | "browser" | "pending"; error: string | null } =>
  hasNativeDb() ? offlineStorageInUse() : { kind: "browser", error: null };

/** The salon this device is signed in to (set by the /nail screen); everything kept offline is filed under it. */
let storeId: number | null = null;
export const setNailOfflineStore = (id: number | null) => { storeId = id; };
export const nailOfflineStore = () => storeId;

/**
 * Which staff screen's door the store's saved changes go through. The server lets a barbershop in only by
 * /api/barber/… and a nail salon only by /api/nail/… (api-server nailTickets.staffScreenAllowed), and the queue
 * is sent from whatever page is open, so the door is remembered per store (set by /barber).
 */
const doorKey = (id: number) => `certxa.staffDoor.${id}`;
export const setStaffDoor = (id: number, door: "nail" | "barber") => {
  try { if (door === "barber") localStorage.setItem(doorKey(id), "barber"); else localStorage.removeItem(doorKey(id)); } catch { /* storage unavailable */ }
};
const barberDoor = (id: number | null) => {
  try { return id != null && localStorage.getItem(doorKey(id)) === "barber"; } catch { return false; }
};
/** A queued change's address for the current store's door. */
export const doorUrl = (url: string, id: number | null = storeId) =>
  barberDoor(id) ? url.replace(/^\/api\/nail\//, "/api/barber/") : url;

/** No answer at all — as opposed to the server answering "no". */
export const isNetworkFailure = (err: unknown): boolean =>
  err instanceof Unreachable || err instanceof TypeError || (err as any)?.name === "AbortError";

export const browserTransport: Transport = {
  async send(method, url, body, idempotencyKey): Promise<Reply> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(doorUrl(url), {
        method, credentials: "include", signal: ctrl.signal,
        headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      throw new Unreachable((err as Error)?.message);
    } finally {
      clearTimeout(timer);
    }
  },
};
