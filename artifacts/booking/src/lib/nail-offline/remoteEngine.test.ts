import { describe, it, expect, vi, beforeEach } from "vitest";

// A salon hub in memory: every message goes to every listener (the native hub relays to the other tablets).
const bus = vi.hoisted(() => ({ up: true, listeners: new Set<(m: any) => void>() }));
vi.mock("../local-hub", () => ({
  localHub: {
    send: (m: any) => { if (!bus.up) return false; const copy = JSON.parse(JSON.stringify(m)); queueMicrotask(() => bus.listeners.forEach((fn) => fn(copy))); return true; },
    onMessage: (fn: (m: any) => void) => { bus.listeners.add(fn); return () => { bus.listeners.delete(fn); }; },
  },
}));

import { NailOffline } from "./engine";
import { memoryKV } from "./store";
import { forwardEngineOverHub, serveEngineOverHub } from "./remoteEngine";

const ticketInput = (clientId: number) => ({
  storeId: 2, clientId, clientName: "Mai Tran", phone: "6025550101", walkinId: null,
  service: { id: 11, name: "Gel Manicure", price: 35, duration: 45 }, addons: [], nail: null, nailLines: [], nailPriceAdjustment: 0,
  customLines: [], staff: null, total: 35, duration: 45,
});

describe("one offline POS for the salon (main POS stands in for the server)", () => {
  let main: NailOffline, station: NailOffline, stop: Array<() => void>;
  beforeEach(() => {
    bus.up = true; bus.listeners.clear();
    main = new NailOffline(memoryKV());
    station = new NailOffline(memoryKV());
    stop = [serveEngineOverHub(main), forwardEngineOverHub(station, { active: () => true, storeId: () => 2 })];
  });

  it("a station's client and ticket are made on the main POS, and both see the same tickets", async () => {
    const client = await station.createClient(2, "Mai Tran", "6025550101");
    const ticket = await station.createTicket(ticketInput(client.id));
    expect((await main.records(2)).map((r) => r.id).sort()).toEqual([client.id, ticket.id].sort());
    expect(await station.localRecords(2)).toEqual([]);
    expect((await station.records(2)).map((r) => r.id).sort()).toEqual((await main.records(2)).map((r) => r.id).sort());
    // A ticket made on the main POS shows on the station too.
    const own = await main.createTicket(ticketInput(client.id));
    expect((await station.records(2)).some((r) => r.id === own.id)).toBe(true);
  });

  it("a station starts and cancels the main POS's ticket there", async () => {
    const client = await main.createClient(2, "Mai Tran", "6025550101");
    const ticket = await main.createTicket(ticketInput(client.id));
    await station.assign(ticket.id, { id: 3, name: "Lan", color: null });
    const started = await station.start(ticket.id);
    expect(started.status).toBe("started");
    expect((await main.records(2)).find((r) => r.id === ticket.id)).toMatchObject({ status: "started", staff: { id: 3 } });
  });

  it("only the main POS will send the work to the server", async () => {
    const client = await station.createClient(2, "Mai Tran", "6025550101");
    await station.createTicket(ticketInput(client.id));
    expect((await main.ops(2)).length).toBe(2);
    expect((await station.ops(2)).length).toBe(0);
  });

  it("with the main POS out of reach the station works on its own, and keeps changing what it holds itself", async () => {
    bus.up = false;
    const client = await station.createClient(2, "Mai Tran", "6025550101");
    const ticket = await station.createTicket(ticketInput(client.id));
    expect((await station.localRecords(2)).length).toBe(2);
    expect(await main.records(2)).toEqual([]);
    bus.up = true;
    await station.start(ticket.id);
    expect((await station.localRecords(2)).find((r) => r.id === ticket.id)).toMatchObject({ status: "started" });
  });

  it("the main POS refusing something is said on the station, not done there instead", async () => {
    await expect(station.start(-999)).rejects.toThrow();
    expect(await station.localRecords(2)).toEqual([]);
  });

  it("forwarding stops when it is switched off", async () => {
    stop[1]();
    const client = await station.createClient(2, "Mai Tran", "6025550101");
    expect((await station.localRecords(2)).map((r) => r.id)).toEqual([client.id]);
    expect(await main.records(2)).toEqual([]);
  });
});
