import { describe, it, expect, vi, beforeEach } from "vitest";

// A stand-in for the app's database (apps/certxa-owner/lib/localDb.ts mirror* requests).
const db = { rows: new Map<string, string>(), state: new Map<number, string>(), failAfterApplies: Infinity, applies: 0 };
const key = (store: number, tbl: string, id: string) => `${store}|${tbl}|${id}`;
async function fakeSend(req: any): Promise<unknown> {
  switch (req.op) {
    case "mirrorState": return db.state.get(req.store) ?? null;
    case "mirrorApply": {
      if (++db.applies > db.failAfterApplies) throw new Error("tablet went to sleep");
      if (req.clear) { for (const k of [...db.rows.keys()]) if (k.startsWith(`${req.store}|`)) db.rows.delete(k); if (!req.state) db.state.delete(req.store); }
      for (const d of req.deletes) db.rows.delete(key(req.store, d.tbl, d.id));
      for (const w of req.deleteWhere) for (const [k, v] of [...db.rows]) if (k.startsWith(`${req.store}|${w.tbl}|`) && JSON.parse(v)[w.field] === w.value) db.rows.delete(k);
      for (const u of req.upserts) db.rows.set(key(req.store, u.tbl, u.id), u.data);
      if (req.state) db.state.set(req.store, req.state);
      return null;
    }
    case "mirrorGet": return db.rows.get(key(req.store, req.tbl, req.id)) ?? null;
    default: throw new Error(`unexpected ${req.op}`);
  }
}
vi.mock("./nail-offline/nativeKV", () => ({ hasNativeMirror: () => true, sharedNativeSend: () => fakeSend }));
vi.mock("./sync-engine", () => ({ syncEngine: { isOffline: () => false, registerOnlineHandler: () => () => {} } }));

// The server: two tables, appointments paged 2 at a time, a change log.
let server: { clients: any[]; appointments: any[]; appointment_addons: any[]; head: number; log: any[]; resyncFrom: number };
function serve(url: string) {
  const u = new URL(url, "http://x");
  if (u.pathname.endsWith("/tables")) return { head: server.head, tables: ["clients", "appointments", "appointment_addons"],
    children: [{ table: "appointment_addons", parent: "appointments", fk: "appointment_id" }] };
  if (u.pathname.endsWith("/rows")) {
    const rows = (server as any)[u.searchParams.get("table")!].filter((r: any) => r.id > Number(u.searchParams.get("afterId")));
    const page = rows.slice(0, 2);
    return { rows: page, lastId: page.length ? page[page.length - 1].id : null, more: rows.length > 2 };
  }
  const after = Number(u.searchParams.get("after"));
  if (after < server.resyncFrom) return { changes: [], last: after, more: false, resync: true };
  const changes = server.log.filter((c) => c.seq > after);
  return { changes, last: changes.length ? changes[changes.length - 1].seq : after, more: false, resync: false };
}
vi.stubGlobal("fetch", async (url: string) => ({ ok: true, json: async () => serve(url) }));

const { syncSalonMirror, mirrorGet } = await import("./salon-mirror");

beforeEach(() => {
  db.rows.clear(); db.state.clear(); db.failAfterApplies = Infinity; db.applies = 0;
  server = {
    clients: [{ id: 1, full_name: "Ana" }, { id: 2, full_name: "Bea" }],
    appointments: [{ id: 10, customer_id: 1 }, { id: 11, customer_id: 1 }, { id: 12, customer_id: 2 }],
    appointment_addons: [{ id: 100, appointment_id: 10 }, { id: 101, appointment_id: 12 }],
    head: 5, log: [], resyncFrom: 0,
  };
});

describe("the salon's copy on the tablet", () => {
  it("copies every table in full, page by page", async () => {
    await syncSalonMirror(7);
    expect(db.rows.size).toBe(7);
    expect((await mirrorGet(7, "appointments", 12))?.customer_id).toBe(2);
    expect(JSON.parse(db.state.get(7)!)).toMatchObject({ complete: true, cursor: 5 });
  });

  it("carries on an interrupted first copy where it stopped", async () => {
    db.failAfterApplies = 3; // the clear, one clients page, then it stops
    await syncSalonMirror(7);
    expect(JSON.parse(db.state.get(7)!).complete).toBe(false);
    db.failAfterApplies = Infinity;
    await syncSalonMirror(7);
    expect(db.rows.size).toBe(7);
    expect(JSON.parse(db.state.get(7)!).complete).toBe(true);
  });

  it("applies the server's changes after the first copy, and a deleted visit takes its add-ons with it", async () => {
    await syncSalonMirror(7);
    server.log = [
      { seq: 6, table: "clients", id: "1", row: { id: 1, full_name: "Ana Lee" } },
      { seq: 7, table: "appointments", id: "10", row: null },
      { seq: 8, table: "clients", id: "3", row: { id: 3, full_name: "Cam" } },
    ];
    await syncSalonMirror(7);
    expect((await mirrorGet(7, "clients", 1))?.full_name).toBe("Ana Lee");
    expect(await mirrorGet(7, "appointments", 10)).toBeNull();
    expect(await mirrorGet(7, "appointment_addons", 100)).toBeNull();
    expect(await mirrorGet(7, "appointment_addons", 101)).not.toBeNull();
    expect(await mirrorGet(7, "clients", 3)).not.toBeNull();
    expect(JSON.parse(db.state.get(7)!).cursor).toBe(8);
  });

  it("copies everything again when it is further behind than the server keeps changes", async () => {
    await syncSalonMirror(7);
    server.resyncFrom = 50; server.head = 60;
    server.clients.push({ id: 4, full_name: "Dee" });
    await syncSalonMirror(7);
    expect(await mirrorGet(7, "clients", 4)).not.toBeNull();
    expect(JSON.parse(db.state.get(7)!)).toMatchObject({ complete: true, cursor: 60 });
  });
});
