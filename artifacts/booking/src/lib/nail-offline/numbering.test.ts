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
  const GAP = NailOffline.OFFLINE_NUMBER_GAP;

  it("start well above the server's last number, leaving room for online bookings made meanwhile", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBe(41 + GAP);
    expect((await engine.createTicket(ticket(2))).ticketNumber).toBe(42 + GAP);
  });

  it("never repeat, even when an older board is seen again", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    await engine.createTicket(ticket(1)); // 41 + GAP
    await engine.noteTicketNumbers(STORE, 40);
    expect((await engine.createTicket(ticket(2))).ticketNumber).toBe(42 + GAP);
  });

  it("start a new run above the server's number after the next outage", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    await engine.createTicket(ticket(1)); // 91
    await engine.noteTicketNumbers(STORE, 100); // back online: the server has moved on
    expect((await engine.createTicket(ticket(2))).ticketNumber).toBe(100 + GAP);
  });

  it("are never the same for two requests at once (the main POS answering other tablets)", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 10);
    const got = await Promise.all([1, 2, 3, 4, 5].map(() => engine.issueTicketNumber(STORE)));
    expect(new Set(got).size).toBe(5);
    expect([...got].sort((a, b) => a! - b!)).toEqual([10 + GAP, 11 + GAP, 12 + GAP, 13 + GAP, 14 + GAP]);
  });

  it("come from the main POS on another station, and stay empty when it can't be reached", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 10);
    engine.setTicketNumberSource(async () => 777);
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBe(777);
    engine.setTicketNumberSource(async () => null);
    expect((await engine.createTicket(ticket(2))).ticketNumber).toBeNull();
  });

  it("give a check-in its number and keep it on the ticket made from it", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 10);
    const { walkin } = await engine.checkIn(STORE, { id: 5, name: "Bea", phone: null });
    expect(walkin.ticketNumber).toBe(10 + GAP);
    expect((await engine.createTicket(ticket(5, walkin.id))).ticketNumber).toBe(10 + GAP);
    // The next client still gets the next number.
    expect((await engine.createTicket(ticket(6))).ticketNumber).toBe(11 + GAP);
  });

  it("are kept separate for each salon", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 10);
    await engine.noteTicketNumbers(8, 500);
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBe(10 + GAP);
    expect((await engine.createTicket({ ...ticket(1), storeId: 8 })).ticketNumber).toBe(500 + GAP);
  });

  it("are left empty on a tablet that has never seen the salon's numbering", async () => {
    const engine = new NailOffline(memoryKV());
    expect((await engine.createTicket(ticket(1))).ticketNumber).toBeNull();
  });

  it("are sent to the server", async () => {
    const engine = new NailOffline(memoryKV());
    await engine.noteTicketNumbers(STORE, 41);
    await engine.createTicket(ticket(1));
    const sent: any[] = [];
    const transport: Transport = {
      async send(method, url, body): Promise<Reply> {
        sent.push({ method, url, body });
        return { status: 201, body: { appointmentId: 900, ticketNumber: 41 + GAP, staffId: null, staffName: null } };
      },
    };
    await engine.sync(transport, STORE);
    expect(sent[0].body.ticketNumber).toBe(41 + GAP);
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
