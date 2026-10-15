import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/nail-offline", async () => {
  const { NailOffline } = await import("@/lib/nail-offline/engine");
  const { memoryKV } = await import("@/lib/nail-offline/store");
  return { nailOffline: new NailOffline(memoryKV()) };
});

import { archivedTicket, refreshTicketArchive } from "./ticketArchive";

const STORE = 7;
const t = (id: number, n: number, extra: Record<string, unknown> = {}) =>
  ({ id, ticketNumber: n, status: "confirmed", date: "2026-10-01T15:00:00.000Z", clientName: `Client ${n}`, service: "Gel", staffName: "Amy", isPaid: false, receipt: null, ...extra });

/** The server: `rows` in id order, paged and filtered as GET /api/nail/ticket-archive does. */
let rows: ReturnType<typeof t>[] = [];
let calls: string[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const q = new URL(url, "http://x").searchParams;
    const after = Number(q.get("afterId")), limit = Number(q.get("limit"));
    const since = q.get("changedSince");
    const matching = rows.filter((r) => r.id > after && (!since || (r as any).changedAt >= Date.parse(since)));
    const page = matching.slice(0, limit);
    return new Response(JSON.stringify({ tickets: page, lastId: page.length ? page[page.length - 1].id : null, more: matching.length > limit }));
  }));
});

describe("past tickets kept on the tablet", () => {
  it("first copy comes down page by page; then new tickets and recent changes only", async () => {
    rows = Array.from({ length: 1200 }, (_, i) => t(i + 1, i + 1, { changedAt: 0 }));
    await refreshTicketArchive(STORE, true);
    expect(calls.length).toBe(3);   // 500 + 500 + 200
    expect(await archivedTicket(STORE, 7)).toMatchObject({ id: 7, clientName: "Client 7" });
    expect(await archivedTicket(STORE, 1200)).toMatchObject({ id: 1200 });

    // Ticket 1199 was paid later, and ticket 1201 is new.
    rows[1198] = t(1199, 1199, { status: "completed", isPaid: true, receipt: { storeName: "Luxury" }, changedAt: Date.now() });
    rows.push(t(1201, 1201, { changedAt: Date.now() }));
    calls = [];
    await refreshTicketArchive(STORE, true);
    expect(calls.some((u) => u.includes("afterId=1200") && !u.includes("changedSince"))).toBe(true);
    expect(calls.some((u) => u.includes("changedSince"))).toBe(true);
    expect(await archivedTicket(STORE, 1199)).toMatchObject({ isPaid: true, receipt: { storeName: "Luxury" } });
    expect(await archivedTicket(STORE, 1201)).toMatchObject({ id: 1201 });
  });

  it("no connection: what it has is kept, and an unknown number is null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(refreshTicketArchive(STORE, true)).resolves.toBeUndefined();
    expect(await archivedTicket(STORE, 99999)).toBeNull();
  });
});
