import { describe, it, expect, vi } from "vitest";
vi.mock("../db", () => ({ pool: {}, db: {} }));
import { idempotent, STALE_MS, type IdempotencyStore, type Reservation } from "../lib/idempotency";

/** The same contract as the database store, kept in a map that outlives a "server restart" in these tests. */
function memoryStore(rows = new Map<string, { state: string; status?: number; body?: unknown; at: number; hash?: string; entityId?: number | null }>(), now = () => Date.now()): IdempotencyStore & { rows: typeof rows } {
  const k = (s: number, key: string) => `${s}:${key}`;
  return {
    rows,
    async reserve(s, key, _scope, hash): Promise<Reservation> {
      const row = rows.get(k(s, key));
      if (!row) { rows.set(k(s, key), { state: "in_progress", at: now(), hash }); return { kind: "new" }; }
      if (hash && row.hash && row.hash !== hash) return { kind: "mismatch" };
      if (row.state === "done") return { kind: "done", status: row.status!, body: row.body };
      return { kind: "in_progress", ageMs: now() - row.at, entityId: row.entityId ?? null };
    },
    async complete(s, key, status, body) { rows.set(k(s, key), { ...rows.get(k(s, key)), state: "done", status, body, at: now() }); },
    async release(s, key) { if (rows.get(k(s, key))?.state === "in_progress") rows.delete(k(s, key)); },
    async takeOver(s, key) { const r = rows.get(k(s, key)); if (r) r.at = now(); },
  };
}

function fakeRes() {
  const listeners: Record<string, () => void> = {};
  const res: any = { statusCode: 200, sent: undefined as unknown, done: null as null | Promise<void> };
  let resolve!: () => void;
  res.done = new Promise<void>((r) => { resolve = r; });
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.sent = b; resolve(); return res; };
  res.on = (ev: string, fn: () => void) => { listeners[ev] = fn; };
  res.emit = (ev: string) => listeners[ev]?.();
  return res;
}
const req = (key?: string, body: unknown = { clientId: 7, serviceId: 11 }) => ({ body, get: (h: string) => (h.toLowerCase() === "x-idempotency-key" ? key : undefined) }) as any;

/** Run one request through the middleware and a handler that "creates" a ticket. */
async function send(store: IdempotencyStore, key: string | undefined, storeId: number, handler: (res: any) => void, body?: unknown, recover?: Parameters<typeof idempotent>[3]) {
  const res = fakeRes();
  let reached = false;
  await idempotent("test", async () => storeId, store, recover)(req(key, body), res, () => { reached = true; handler(res); });
  await Promise.race([res.done, new Promise((r) => setTimeout(r, 20))]);
  return { res, reached };
}

describe("durable idempotency", () => {
  it("does the work once and replays the stored answer for the same key", async () => {
    const store = memoryStore();
    let made = 0;
    const create = (res: any) => { made += 1; res.status(201).json({ appointmentId: 500 + made }); };
    const first = await send(store, "key-aaaaaaaa", 2, create);
    const again = await send(store, "key-aaaaaaaa", 2, create);
    expect(made).toBe(1);
    expect(first.res.sent).toEqual({ appointmentId: 501 });
    expect(again.reached).toBe(false);
    expect(again.res.statusCode).toBe(201);
    expect(again.res.sent).toEqual({ appointmentId: 501, alreadyProcessed: true });
  });

  it("still replays after a server restart (the answer is in the database, not in memory)", async () => {
    const rows = new Map();
    let made = 0;
    const create = (res: any) => { made += 1; res.status(201).json({ appointmentId: 700 }); };
    await send(memoryStore(rows), "key-restart1", 2, create);
    // New process: a fresh middleware and store object over the same table.
    const after = await send(memoryStore(rows), "key-restart1", 2, create);
    expect(made).toBe(1);
    expect(after.res.sent).toEqual({ appointmentId: 700, alreadyProcessed: true });
  });

  it("keeps salons apart: the same key in another salon is a different request", async () => {
    const store = memoryStore();
    let made = 0;
    const create = (res: any) => { made += 1; res.status(201).json({ n: made }); };
    await send(store, "key-shared12", 2, create);
    await send(store, "key-shared12", 3, create);
    expect(made).toBe(2);
  });

  it("stores nothing for a failed request, so it can be tried again", async () => {
    const store = memoryStore();
    let tries = 0;
    const flaky = (res: any) => { tries += 1; if (tries === 1) res.status(409).json({ message: "busy" }); else res.status(201).json({ ok: true }); };
    const a = await send(store, "key-retry123", 2, flaky);
    const b = await send(store, "key-retry123", 2, flaky);
    expect(a.res.statusCode).toBe(409);
    expect(b.res.statusCode).toBe(201);
    expect(tries).toBe(2);
  });

  it("refuses a second copy while the first is still running, and frees the key if the connection drops", async () => {
    const store = memoryStore();
    const hung = fakeRes();
    await idempotent("test", async () => 2, store)(req("key-running1"), hung, () => { /* never answers */ });
    const second = await send(store, "key-running1", 2, (res) => res.json({}));
    expect(second.reached).toBe(false);
    expect(second.res.statusCode).toBe(409);
    expect(second.res.sent).toMatchObject({ code: "REQUEST_IN_PROGRESS" });
    hung.emit("close");
    const third = await send(store, "key-running1", 2, (res) => res.status(201).json({ ok: true }));
    expect(third.reached).toBe(true);
  });

  it("takes over a reservation whose request died long ago", async () => {
    let clock = 1_000_000;
    const store = memoryStore(new Map(), () => clock);
    await store.reserve(2, "key-dead1234", "test");
    clock += STALE_MS + 1;
    const r = await send(store, "key-dead1234", 2, (res) => res.status(201).json({ ok: true }));
    expect(r.reached).toBe(true);
  });

  it("leaves requests without a key alone", async () => {
    const store = memoryStore();
    let made = 0;
    const create = (res: any) => { made += 1; res.json({}); };
    await send(store, undefined, 2, create);
    await send(store, undefined, 2, create);
    expect(made).toBe(2);
    expect(store.rows.size).toBe(0);
  });

  it("of two identical requests arriving at the same moment, exactly one does the work", async () => {
    const store = memoryStore();
    let made = 0;
    const slowCreate = (res: any) => { made += 1; setTimeout(() => res.status(201).json({ appointmentId: 801 }), 5); };
    const [a, b] = await Promise.all([send(store, "key-together1", 2, slowCreate), send(store, "key-together1", 2, slowCreate)]);
    // send() stops waiting after 20 ms; on a busy machine the 5 ms "slow" answer can come later than that
    // (this failed once in a full run). Wait for both answers before looking at them.
    await Promise.all([a.res.done, b.res.done]);
    expect(made).toBe(1);
    expect([a.res.statusCode, b.res.statusCode].sort()).toEqual([201, 409]);
    // The one that was told to wait asks again and gets the same ticket.
    const again = await send(store, "key-together1", 2, slowCreate);
    expect(again.res.sent).toEqual({ appointmentId: 801, alreadyProcessed: true });
    expect(made).toBe(1);
  });

  it("refuses a key that comes back with different contents, and does not run it", async () => {
    const store = memoryStore();
    let made = 0;
    const create = (res: any) => { made += 1; res.status(201).json({ appointmentId: 900 }); };
    await send(store, "key-reused01", 2, create, { clientId: 7, serviceId: 11 });
    const other = await send(store, "key-reused01", 2, create, { clientId: 8, serviceId: 11 });
    expect(other.reached).toBe(false);
    expect(other.res.statusCode).toBe(422);
    expect(other.res.sent).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(made).toBe(1);
    // The same contents in a different field order are the same request.
    const same = await send(store, "key-reused01", 2, create, { serviceId: 11, clientId: 7 });
    expect(same.res.sent).toEqual({ appointmentId: 900, alreadyProcessed: true });
  });

  it("a request that died AFTER creating its ticket is answered from that ticket, not run again", async () => {
    let clock = 1_000_000;
    const store = memoryStore(new Map(), () => clock);
    // The first request reserved the key and created ticket 555 in its transaction, then the server died.
    await store.reserve(2, "key-crashed1", "test", undefined);
    store.rows.get("2:key-crashed1")!.entityId = 555;
    clock += STALE_MS + 1;
    let made = 0;
    const retry = await send(store, "key-crashed1", 2, (res) => { made += 1; res.status(201).json({ appointmentId: 999 }); }, undefined,
      async (entityId) => ({ status: 201, body: { appointmentId: entityId, ticketNumber: 14 } }));
    expect(made).toBe(0);
    expect(retry.res.sent).toEqual({ appointmentId: 555, ticketNumber: 14, alreadyProcessed: true });
    // And that answer is now the stored one.
    const third = await send(store, "key-crashed1", 2, (res) => { made += 1; res.json({}); });
    expect(third.res.sent).toMatchObject({ appointmentId: 555 });
    expect(made).toBe(0);
  });
});
