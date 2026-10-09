/** The /nail offline engine as the browser uses it: IndexedDB for storage, `fetch` for the server. */
import { NailOffline, Unreachable, type Reply, type Transport } from "./engine";
import { indexedDbKV } from "./store";

export * from "./engine";

export const nailOffline = new NailOffline(indexedDbKV());

/** The salon this device is signed in to (set by the /nail screen); everything kept offline is filed under it. */
let storeId: number | null = null;
export const setNailOfflineStore = (id: number | null) => { storeId = id; };
export const nailOfflineStore = () => storeId;

/** No answer at all — as opposed to the server answering "no". */
export const isNetworkFailure = (err: unknown): boolean =>
  err instanceof Unreachable || err instanceof TypeError || (err as any)?.name === "AbortError";

export const browserTransport: Transport = {
  async send(method, url, body, idempotencyKey): Promise<Reply> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(url, {
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
