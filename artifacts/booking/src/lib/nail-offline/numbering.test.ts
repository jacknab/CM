import { describe, it, expect } from "vitest";
import { NailOffline, type Reply, type Transport } from "./engine";
import { memoryKV } from "./store";

const STORE = 7;
const svc = { id: 1, name: "Manicure", price: 25, duration: 30 };
const ticket = (clientId: number, walkinId: number | null = null) => ({
  storeId: STORE, clientId, clientName: "Ana", phone: null, walkinId, service: svc, addons: [], nail: null, nailLines: [],
  nailPriceAdjustment: 0, customLines: [], staff: null, total: 25, duration: 30,
});

describe("ticket numbers given while offline", () => {
  it("carry on from the highest number the server was seen to use", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBe(42);
    expect((await engine.createTicket(ticket(2))).ticketNumber).toBe(43);
  });

  it("never go backwards when an older board is seen again", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    await engine.createTicket(ticket(1)); // 42
    await engine.noteTicketNumbers(STORE, 40);
    expect((await engine.createTicket(ticket(2))).ticketNumber).toBe(43);
  });

  it("give a check-in its number and keep it on the ticket made from it", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 10);
    const { walkin } = await engine.checkIn(STORE, { id: 5, name: "Bea", phone: null });
    expect(walkin.ticketNumber).toBe(11);
    expect((await engine.createTicket(ticket(5, walkin.id))).ticketNumber).toBe(11);
    // The next client still gets the next number.
    expect((await engine.createTicket(ticket(6))).ticketNumber).toBe(12);
  });

  it("are kept separate for each salon", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 10);
    await engine.noteTicketNumbers(8, 500);
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBe(11);
    expect((await engine.createTicket({ ...ticket(1), storeId: 8 })).ticketNumber).toBe(501);
  });

  it("are left empty on a tablet that has never seen the salon's numbering", async () => {
    const engine = new NailOffline(memoryKV());
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBeNull();
  });

  it("are sent to the server, and the server's answer wins when it gives a different one", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    const made = await engine.createTicket(ticket(1));
    const sent: any[] = [];
    const transport: Transport = {
      async send(method, url, body): Promise<Reply> {
        sent.push({ method, url, body });
        // Another tablet already used 42, so the server hands out 44.
        return { status: 201, body: { appointmentId: 900, ticketNumber: 44, staffId: null, staffName: null } };
      },
    };
    await engine.sync(transport, STORE);
    expect(sent[0].body.ticketNumber).toBe(42);
    const after = (await engine.records(STORE)).find((r) => r.kind === "ticket" && r.id === made.id) as any;
    expect(after.ticketNumber).toBe(44);
  });
});

describe("times recorded while offline", () => {
  it("are written in the server's time, using the last measured difference", async () => {
    const device = new Date("2026-10-12T15:00:00.000Z");
    const engine = new NailOffline(memoryKV(), () => device);
    engine.setClockOffset(-90_000); // this tablet's clock runs 90 seconds fast
    const made = await engine.createTicket(ticket(1));
    expect(made.createdAt).toBe("2026-10-12T14:58:30.000Z");
    expect((await engine.start(made.id)).startedAt).toBe("2026-10-12T14:58:30.000Z");
  });
});
