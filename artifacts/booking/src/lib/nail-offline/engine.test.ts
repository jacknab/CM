import { describe, it, expect } from "vitest";
import { NailOffline, Unreachable, type Reply, type Transport, type TicketRecord } from "./engine";
import { memoryKV, type KV } from "./store";

/**
 * A stand-in for the Certxa server with the behaviour that matters here: it keeps the first answer for each
 * idempotency key in its "database" (which survives `restart()`), refuses a second client with the same
 * phone, and can be switched off, made to lose its replies, sign the device out, or refuse a ticket.
 */
function fakeServer() {
  const db = { keys: new Map<string, Reply>(), clients: [] as { id: number; name: string; phone: string }[], checkins: [] as { id: number; clientId: number }[],
    tickets: [] as { id: number; clientId: number; serviceId: number; staffId: number | null; checkinId: number | null; status: string }[],
    sales: [] as { appointmentId: number; totalPaid: number; cash: number }[], collectedAt: [] as (string | undefined)[] };
  const state = { up: true, signedIn: true, dropReplies: 0, refuseTickets: null as string | null, calls: [] as string[] };
  let seq = 100;
  const handle = (method: string, url: string, body: any): Reply => {
    if (url === "/api/customers" && method === "POST") {
      if (db.clients.some((c) => c.phone === body.phone)) return { status: 409, body: { code: "PHONE_DUPLICATE", message: "That phone number belongs to another client" } };
      const c = { id: ++seq, name: body.name, phone: body.phone };
      db.clients.push(c);
      return { status: 201, body: c };
    }
    if (url.startsWith("/api/customers/search")) {
      const phone = new URL(`http://x${url}`).searchParams.get("phone");
      return { status: 200, body: db.clients.filter((c) => c.phone === phone) };
    }
    if (url === "/api/nail/checkin") {
      if (!db.clients.some((c) => c.id === body.clientId)) return { status: 404, body: { message: "Client not found" } };
      const open = db.checkins.find((k) => k.clientId === body.clientId);
      if (open) return { status: 200, body: { status: "already" } };
      const k = { id: ++seq, clientId: body.clientId };
      db.checkins.push(k);
      return { status: 200, body: { status: "walkin", checkin: { id: k.id } } };
    }
    if (url === "/api/nail/tickets") {
      if (state.refuseTickets) return { status: 400, body: { message: state.refuseTickets } };
      const t = { id: ++seq, clientId: body.clientId, serviceId: body.serviceId, staffId: body.staffId ?? null, checkinId: body.checkinId ?? null, status: "confirmed" };
      db.tickets.push(t);
      return { status: 201, body: { appointmentId: t.id, ticketNumber: db.tickets.length, staffId: t.staffId, staffName: t.staffId ? "Lan" : null } };
    }
    const start = /^\/api\/appointments\/(\d+)$/.exec(url);
    if (start && method === "PATCH") {
      const t = db.tickets.find((x) => x.id === Number(start[1]));
      if (!t) return { status: 404, body: { message: "Not found" } };
      // As PATCH /api/appointments/:id: a change based on an older state is refused once the ticket moved on.
      if (body.expectedStatus && t.status !== body.expectedStatus && t.status !== body.status) {
        return { status: 409, body: { code: "STATUS_CONFLICT", message: `This ticket ${t.status === "completed" ? "has already been checked out" : `is now ${t.status}`} on another device.` } };
      }
      t.status = body.status;
      return { status: 200, body: t };
    }
    const re = /^\/api\/nail\/tickets\/(\d+)\/reassign$/.exec(url);
    if (re) {
      const t = db.tickets.find((x) => x.id === Number(re[1]));
      if (!t) return { status: 404, body: { message: "Ticket not found" } };
      if (!["confirmed", "started"].includes(t.status)) return { status: 409, body: { message: "This ticket is already closed." } };
      if (body.expectedStaffId !== undefined && t.staffId !== body.expectedStaffId && t.staffId !== body.staffId) {
        return { status: 409, body: { message: "This ticket was given to Kim on another device." } };
      }
      t.staffId = body.staffId;
      return { status: 200, body: { staffId: t.staffId } };
    }
    const put = /^\/api\/nail\/tickets\/(\d+)$/.exec(url);
    if (put && method === "PUT") {
      const t = db.tickets.find((x) => x.id === Number(put[1]));
      if (!t) return { status: 404, body: { message: "Ticket not found" } };
      // Like the real route: refuse when the ticket is no longer what the device last saw.
      if (body.expected && body.expected.serviceId !== t.serviceId) return { status: 409, body: { message: "This ticket was changed on another device. Review it before saving." } };
      t.serviceId = body.serviceId;
      return { status: 200, body: { duration: 60, price: 50 } };
    }
    if (url === "/api/nail/checkout") {
      const t = db.tickets.find((x) => x.id === body.appointmentId);
      if (!t) return { status: 404, body: { message: "Ticket not found" } };
      if (t.status === "completed") return { status: 409, body: { message: "This ticket has already been checked out." } };
      if (t.status === "cancelled") return { status: 409, body: { message: "This ticket was cancelled." } };
      t.status = "completed";
      db.sales.push({ appointmentId: t.id, totalPaid: body.totalPaid, cash: body.tenders.reduce((n: number, x: any) => n + x.amount, 0) });
      db.collectedAt.push(body.collectedAt);
      return { status: 200, body: { turns: [] } };
    }
    return { status: 404, body: { message: `no route ${method} ${url}` } };
  };
  const transport: Transport = {
    async send(method, url, body, key) {
      state.calls.push(`${method} ${url}`);
      if (!state.up) throw new Unreachable();
      if (!state.signedIn) return { status: 401, body: { message: "Unauthorized" } };
      let reply = key ? db.keys.get(key) : undefined;
      if (reply) reply = { status: reply.status, body: { ...reply.body, alreadyProcessed: true } };
      else {
        reply = handle(method, url, body);
        if (key && reply.status < 300) db.keys.set(key, reply);
      }
      // The work was done, but the answer never reached the device.
      if (state.dropReplies > 0) { state.dropReplies -= 1; throw new Unreachable("reply lost"); }
      return reply;
    },
  };
  return { db, state, transport };
}

const ticketInput = (clientId: number, walkinId: number | null, staff: TicketRecord["staff"] = null) => ({
  storeId: 2, clientId, clientName: "Mai Tran", phone: "6025550101", walkinId,
  service: { id: 11, name: "Gel Manicure", price: 35, duration: 45 }, addons: [{ id: 5, name: "French Tips", price: 10, duration: 10 }],
  nail: null, nailLines: [], nailPriceAdjustment: 0, customLines: [], staff, total: 45, duration: 55,
});

/** Offline: a new client walks in, is checked in, and a ticket is made for them. */
async function walkInOffline(engine: NailOffline) {
  const client = await engine.createClient(2, "Mai Tran", "(602) 555-0101");
  const { walkin } = await engine.checkIn(2, { id: client.id, name: client.name, phone: client.phone });
  const ticket = await engine.createTicket(ticketInput(client.id, walkin.id));
  return { client, walkin, ticket };
}

describe("offline walk-in on /nail", () => {
  it("saves the client, the walk-in and the ticket on the device, linked to each other, with no server at all", async () => {
    const engine = new NailOffline(memoryKV());
    const { client, walkin, ticket } = await walkInOffline(engine);
    expect(client.id).toBeLessThan(0);
    expect(walkin.clientId).toBe(client.id);
    expect(ticket.clientId).toBe(client.id);
    expect(ticket.walkinId).toBe(walkin.id);
    const recs = await engine.records(2);
    expect(recs.map((r) => r.kind).sort()).toEqual(["client", "ticket", "walkin"]);
    // The walk-in became the ticket; it is no longer a second waiting entry.
    expect(recs.find((r) => r.kind === "walkin")).toMatchObject({ status: "ticketed" });
    expect(await engine.counts(2)).toMatchObject({ pending: 3, attention: 0 });
  });

  it("is all still there after the app is closed and opened again", async () => {
    const kv = memoryKV();
    await walkInOffline(new NailOffline(kv));
    const reopened = new NailOffline(memoryKV(kv.data));
    expect((await reopened.records(2)).length).toBe(3);
    expect((await reopened.ops(2)).map((o) => o.type)).toEqual(["client.create", "walkin.create", "ticket.create"]);
    expect(await reopened.findClients(2, "mai")).toHaveLength(1);
    expect(await reopened.findClients(2, "5550101")).toHaveLength(1);
  });

  it("does not check the same client in twice", async () => {
    const engine = new NailOffline(memoryKV());
    const first = await engine.checkIn(2, { id: 77, name: "Ana", phone: null });
    const second = await engine.checkIn(2, { id: 77, name: "Ana", phone: null });
    expect(second.already).toBe(true);
    expect(second.walkin.id).toBe(first.walkin.id);
    expect((await engine.ops(2)).length).toBe(1);
  });

  it("keeps a chosen technician on the ticket and lets a ticket be started", async () => {
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.assign(ticket.id, { id: 9, name: "Lan", color: null });
    await engine.start(ticket.id);
    const saved = (await engine.records(2)).find((r) => r.kind === "ticket") as TicketRecord;
    expect(saved.staff?.id).toBe(9);
    expect(saved.status).toBe("started");
  });
});

describe("synchronising when the connection returns", () => {
  it("sends client, walk-in and ticket in that order and links them by their real ids", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.assign(ticket.id, { id: 9, name: "Lan", color: null });
    const result = await engine.sync(server.transport);
    expect(result).toMatchObject({ synced: 3, stopped: null, pending: 0, attention: 0 });
    expect(server.state.calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/customers", "POST /api/nail/checkin", "POST /api/nail/tickets"]);
    const [client] = server.db.clients; const [checkin] = server.db.checkins; const [made] = server.db.tickets;
    expect(made).toMatchObject({ clientId: client.id, checkinId: checkin.id, staffId: 9, serviceId: 11 });
    expect(checkin.clientId).toBe(client.id);
  });

  it("sends nothing and loses nothing while the server is unreachable", async () => {
    const server = fakeServer();
    server.state.up = false;
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    const result = await engine.sync(server.transport);
    expect(result).toMatchObject({ synced: 0, stopped: "unreachable", pending: 3 });
    // Being offline is not a failed attempt.
    expect((await engine.ops(2)).every((o) => o.attempts === 0 && o.state === "pending")).toBe(true);
  });

  it("makes each thing once even when replies are lost and the sync is repeated", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    // The server does the work three times over, but each answer is lost on the way back.
    for (let i = 0; i < 3; i++) { server.state.dropReplies = 1; await engine.sync(server.transport); }
    for (let i = 0; i < 4; i++) await engine.sync(server.transport);
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.checkins).toHaveLength(1);
    expect(server.db.tickets).toHaveLength(1);
    expect(await engine.counts(2)).toMatchObject({ pending: 0, attention: 0 });
  });

  it("makes each thing once across an app restart in the middle of a sync", async () => {
    const server = fakeServer();
    const kv = memoryKV();
    await walkInOffline(new NailOffline(kv));
    server.state.dropReplies = 1;                       // ticket's client is created, reply lost, app is killed
    await new NailOffline(kv).sync(server.transport);
    await new NailOffline(memoryKV(kv.data)).sync(server.transport);   // app reopened
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.tickets).toHaveLength(1);
  });

  it("keeps everything when the device has been signed out, and sends it after signing in", async () => {
    const server = fakeServer();
    server.state.signedIn = false;
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    expect(await engine.sync(server.transport)).toMatchObject({ synced: 0, stopped: "sign-in", pending: 3, attention: 0 });
    server.state.signedIn = true;
    expect(await engine.sync(server.transport)).toMatchObject({ synced: 3, pending: 0 });
  });

  it("uses the existing client when the phone number was added from another tablet meanwhile", async () => {
    const server = fakeServer();
    server.db.clients.push({ id: 55, name: "Mai T.", phone: "6025550101" });
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    await engine.sync(server.transport);
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.tickets[0].clientId).toBe(55);
  });

  it("holds a refused ticket for staff attention; retry sends it, and the client and walk-in are not repeated", async () => {
    const server = fakeServer();
    server.state.refuseTickets = "Lan doesn't perform this service.";
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    expect(await engine.sync(server.transport)).toMatchObject({ synced: 2, pending: 0, attention: 1 });
    const [stuck] = (await engine.ops(2)).filter((o) => o.state === "attention");
    expect(stuck).toMatchObject({ type: "ticket.create", lastError: "Lan doesn't perform this service." });
    // Still there on the next pass — never dropped by itself.
    await engine.sync(server.transport);
    expect((await engine.counts(2)).attention).toBe(1);
    server.state.refuseTickets = null;
    await engine.retry(stuck.id);
    expect(await engine.sync(server.transport)).toMatchObject({ synced: 1, attention: 0, pending: 0 });
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.checkins).toHaveLength(1);
    expect(server.db.tickets).toHaveLength(1);
  });

  it("discarding a refused client also removes the walk-in and ticket that depended on it", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    const [clientOp] = await engine.ops(2);
    await engine.discard(clientOp.id);
    expect(await engine.records(2)).toHaveLength(0);
    expect(await engine.ops(2)).toHaveLength(0);
    expect((await engine.sync(server.transport)).synced).toBe(0);
  });

  it("a ticket started offline is started on the server after it has been created there", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.start(ticket.id);
    await engine.sync(server.transport);
    expect(server.db.tickets[0].status).toBe("started");
  });

  it("cancelling an unsent ticket removes it from the queue and puts the walk-in back in the waiting list", async () => {
    const engine = new NailOffline(memoryKV());
    const { ticket, walkin } = await walkInOffline(engine);
    await engine.cancel(ticket.id);
    const recs = await engine.records(2);
    expect(recs.some((r) => r.kind === "ticket")).toBe(false);
    expect(recs.find((r) => r.id === walkin.id)).toMatchObject({ status: "waiting" });
    expect((await engine.ops(2)).map((o) => o.type)).toEqual(["client.create", "walkin.create"]);
  });

  it("prune never removes anything still waiting to be sent", async () => {
    const server = fakeServer();
    let clock = Date.parse("2026-10-09T10:00:00Z");
    const engine = new NailOffline(memoryKV(), () => new Date(clock));
    await walkInOffline(engine);
    server.state.refuseTickets = "nope";
    await engine.sync(server.transport);                 // client + walk-in sent, ticket held
    clock += 2 * 60 * 60_000;
    await engine.prune();
    const kinds = (await engine.records(2)).map((r) => r.kind).sort();
    // The ticket is still to be sent, so it and the client it points at stay.
    expect(kinds).toContain("ticket");
    expect(kinds).toContain("client");
    expect((await engine.counts(2)).attention).toBe(1);
  });
});

const cashRequest = (total: number) => ({ tenders: [{ method: "cash", amount: total }], paymentMethod: "cash", tip: 0, discount: 0, tax: 0, totalPaid: total, serviceRevenue: total, productRevenue: 0 });
/** A ticket the server already has (it was on the board before the outage). */
const serverTicket = (server: ReturnType<typeof fakeServer>, over: Partial<{ serviceId: number; staffId: number | null }> = {}) => {
  const t = { id: 900 + server.db.tickets.length, clientId: 7, serviceId: 11, staffId: null as number | null, checkinId: null, status: "confirmed", ...over };
  server.db.tickets.push(t);
  return t;
};

describe("phase 3: working a full day offline", () => {
  it("edits a ticket that only exists on this device, and the edited ticket is what gets sent", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    const edited = await engine.editLocal(ticket.id, { service: { id: 12, name: "Deluxe Manicure", price: 45, duration: 60 }, addons: [], total: 45, duration: 60 });
    expect(edited.total).toBe(45);
    // No extra operation: the one create simply carries the new contents.
    expect((await engine.ops(2)).map((o) => o.type)).toEqual(["client.create", "walkin.create", "ticket.create"]);
    await engine.sync(server.transport);
    expect(server.db.tickets[0].serviceId).toBe(12);
  });

  it("starts, moves and cancels tickets the server already had, in order, after reconnecting", async () => {
    const server = fakeServer();
    const a = serverTicket(server); const b = serverTicket(server);
    const engine = new NailOffline(memoryKV());
    await engine.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "reassign", staff: { id: 9, name: "Lan", color: null } });
    await engine.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "start" });
    await engine.changeServerTicket(2, { id: b.id, clientName: "Bo" }, { type: "cancel" });
    // One record per server ticket, however many changes.
    expect((await engine.records(2)).filter((r) => r.kind === "patch")).toHaveLength(2);
    expect(await engine.sync(server.transport)).toMatchObject({ synced: 3, attention: 0, pending: 0 });
    expect(server.db.tickets.find((t) => t.id === a.id)).toMatchObject({ staffId: 9, status: "started" });
    expect(server.db.tickets.find((t) => t.id === b.id)).toMatchObject({ status: "cancelled" });
  });

  it("sends only the latest of several edits to the same ticket", async () => {
    const server = fakeServer();
    const a = serverTicket(server);
    const engine = new NailOffline(memoryKV());
    await engine.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "update", view: { total: 40 }, body: { serviceId: 12, expected: { serviceId: 11 } } });
    await engine.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "update", view: { total: 50 }, body: { serviceId: 13, expected: { serviceId: 11 } } });
    expect((await engine.ops(2)).map((o) => o.type)).toEqual(["ticket.update"]);
    await engine.sync(server.transport);
    expect(server.db.tickets[0].serviceId).toBe(13);
  });

  it("two devices edit the same ticket: the second is refused as a conflict and held, never merged or dropped", async () => {
    const server = fakeServer();
    const a = serverTicket(server);
    const tabletA = new NailOffline(memoryKV()); const tabletB = new NailOffline(memoryKV());
    await tabletA.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "update", view: {}, body: { serviceId: 12, expected: { serviceId: 11 } } });
    await tabletB.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "update", view: {}, body: { serviceId: 13, expected: { serviceId: 11 } } });
    await tabletA.sync(server.transport);
    const second = await tabletB.sync(server.transport);
    expect(second).toMatchObject({ synced: 0, attention: 1 });
    expect(server.db.tickets[0].serviceId).toBe(12);
    const [held] = (await tabletB.ops(2)).filter((o) => o.state === "attention");
    expect(held).toMatchObject({ type: "ticket.update", conflict: true });
    expect(held.lastError).toMatch(/changed on another device/);
    // Still on the device for staff to deal with.
    expect((await tabletB.records(2)).some((r) => r.kind === "patch")).toBe(true);
  });

  it("records a cash sale on a ticket made offline, and closes it on the server exactly once", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.start(ticket.id);
    const paid = await engine.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "checkout-key-1" });
    expect(paid.synced).toBeUndefined();
    expect(await engine.counts(2)).toMatchObject({ pending: 5, cash: { count: 1, amount: 45 } });
    // Replies lost, sync repeated: one sale.
    server.state.dropReplies = 2;
    for (let i = 0; i < 6; i++) await engine.sync(server.transport);
    expect(server.db.sales).toEqual([{ appointmentId: server.db.tickets[0].id, totalPaid: 45, cash: 45 }]);
    expect(server.db.tickets[0].status).toBe("completed");
    expect(await engine.counts(2)).toMatchObject({ pending: 0, attention: 0, cash: { count: 0, amount: 0 } });
    const saved = (await engine.records(2)).find((r) => r.kind === "ticket") as TicketRecord;
    expect(saved.paid?.synced).toBe(true);
  });

  it("a second tap on pay does not record the cash twice", async () => {
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-aaaaaaa1" });
    await engine.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-aaaaaaa2" });
    expect((await engine.ops(2)).filter((o) => o.type === "ticket.checkout")).toHaveLength(1);
    expect((await engine.counts(2)).cash).toEqual({ count: 1, amount: 45 });
  });

  it("cash taken for a ticket another device already closed stays visible as needing attention", async () => {
    const server = fakeServer();
    const a = serverTicket(server);
    const engine = new NailOffline(memoryKV());
    await engine.recordCash(2, { id: a.id, clientName: "Ana" }, { totalPaid: 35, cash: 35, tip: 0, request: cashRequest(35), idempotencyKey: "k-conflict1" });
    a.status = "completed";                               // closed from the other tablet meanwhile
    expect(await engine.sync(server.transport)).toMatchObject({ synced: 0, attention: 1 });
    // The money is still counted as unreconciled on this device — it is not quietly forgotten.
    expect((await engine.counts(2)).cash).toEqual({ count: 1, amount: 35 });
    expect(server.db.sales).toHaveLength(0);
  });

  it("a paid ticket cannot be cancelled or edited on the device", async () => {
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-paid0001" });
    await expect(engine.cancel(ticket.id)).rejects.toThrow(/paid/);
    await expect(engine.editLocal(ticket.id, { total: 1 })).rejects.toThrow(/paid/);
  });

  it("a ticket refused because of its technician can be sent again for the turn line to decide", async () => {
    const server = fakeServer();
    server.state.refuseTickets = "Lan doesn't perform this service.";
    const engine = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(engine);
    await engine.assign(ticket.id, { id: 9, name: "Lan", color: null });
    await engine.sync(server.transport);
    const [held] = (await engine.ops(2)).filter((o) => o.state === "attention");
    server.state.refuseTickets = null;
    await engine.sendWithoutTechnician(held.id);
    await engine.sync(server.transport);
    expect(server.db.tickets).toHaveLength(1);
    expect(server.db.tickets[0].staffId).toBeNull();
  });

  it("everything survives an app restart mid-day and a server restart mid-sync", async () => {
    const server = fakeServer();
    const a = serverTicket(server);
    const kv = memoryKV();
    const morning = new NailOffline(kv);
    const { ticket } = await walkInOffline(morning);
    await morning.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-restart01" });
    await morning.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "start" });
    // App closed and reopened; the server answers once then goes away mid-sync, then comes back.
    const afternoon = new NailOffline(memoryKV(kv.data));
    expect((await afternoon.counts(2)).cash.amount).toBe(45);
    server.state.dropReplies = 1;
    await afternoon.sync(server.transport);
    server.state.up = false;
    expect((await afternoon.sync(server.transport)).stopped).toBe("unreachable");
    server.state.up = true;
    await new NailOffline(memoryKV(kv.data)).sync(server.transport);
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.tickets.filter((t) => t.clientId === server.db.clients[0].id)).toHaveLength(1);
    expect(server.db.sales).toHaveLength(1);
    expect(server.db.tickets.find((t) => t.id === a.id)?.status).toBe("started");
  });
});

describe("reads kept on the device", () => {
  it("returns the last board (with today's appointments) the server sent, per salon, after a restart", async () => {
    const kv = memoryKV();
    const board = { tickets: [{ id: 900 }], markers: [], dayBookings: [{ id: 41, clientName: "Ana", serviceName: "Gel Manicure", date: "2026-10-09T18:00:00Z" }], techStats: [] };
    await new NailOffline(kv).remember(2, "/api/nail/board", board);
    const reopened = new NailOffline(memoryKV(kv.data));
    expect((await reopened.recall<typeof board>(2, "/api/nail/board"))?.data.dayBookings[0]).toMatchObject({ id: 41, clientName: "Ana" });
    // Another salon signed in on the same tablet never sees it.
    expect(await reopened.recall(3, "/api/nail/board")).toBeUndefined();
  });
});

describe("when offline cash was taken", () => {
  it("tells the server the time the cash was collected, not the time it was sent", async () => {
    const server = fakeServer();
    let clock = Date.parse("2026-10-09T21:15:00Z");
    const engine = new NailOffline(memoryKV(), () => new Date(clock));
    const { ticket } = await walkInOffline(engine);
    await engine.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-collected1" });
    clock = Date.parse("2026-10-10T16:00:00Z");           // the tablet only reconnects the next morning
    await engine.sync(server.transport);
    expect(server.db.collectedAt).toEqual(["2026-10-09T21:15:00.000Z"]);
  });
});

/** A device whose storage starts refusing writes (full, or the database will not open). */
function failingKV(inner: ReturnType<typeof memoryKV>, state: { broken: null | "QuotaExceededError" | "InvalidStateError" }): KV {
  return {
    get: (s, k) => inner.get(s, k), getAll: (s) => inner.getAll(s), keys: (s) => inner.keys(s),
    async batch(writes) {
      if (state.broken) { const e = new Error(state.broken === "QuotaExceededError" ? "The quota has been exceeded." : "The database connection is closing."); e.name = state.broken; throw e; }
      return inner.batch(writes);
    },
  };
}

describe("phase 4: recovery and protection of what is on the device", () => {
  it("only ever sends the signed-in salon's work; another salon's stays on the tablet untouched", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    await engine.createClient(2, "Mai Tran", "6025550101");          // saved while salon 2 was signed in
    await engine.createClient(3, "Bo Lee", "6025550199");            // saved while salon 3 was signed in
    // Salon 3 is the one signed in now.
    expect(await engine.sync(server.transport, 3)).toMatchObject({ synced: 1, pending: 0 });
    expect(server.db.clients.map((c) => c.name)).toEqual(["Bo Lee"]);
    expect(await engine.heldForOtherSalons(3)).toBe(1);
    expect((await engine.counts(2)).pending).toBe(1);
    // Each salon sees only its own records.
    expect((await engine.records(3)).map((r) => (r as any).name)).toEqual(["Bo Lee"]);
    expect(await engine.findClients(3, "mai")).toHaveLength(0);
  });

  it("keeps everything through an expired sign-in and sends it after signing in again, without asking twice", async () => {
    const server = fakeServer();
    server.state.signedIn = false;
    const kv = memoryKV();
    const engine = new NailOffline(kv);
    const { ticket } = await walkInOffline(engine);
    await engine.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-expired001" });
    const calls = () => server.state.calls.length;
    expect(await engine.sync(server.transport, 2)).toMatchObject({ stopped: "sign-in", synced: 0 });
    // One refused request per pass, then it stops: the rest of the queue is not thrown at a signed-out server.
    expect(calls()).toBe(1);
    expect((await engine.ops(2)).every((o) => o.state === "pending" && o.attempts === 0)).toBe(true);
    // App restarted while still signed out, then someone signs in.
    const later = new NailOffline(memoryKV(kv.data));
    server.state.signedIn = true;
    expect(await later.sync(server.transport, 2)).toMatchObject({ stopped: null, pending: 0, attention: 0 });
    expect(server.db.sales).toHaveLength(1);
    expect(await later.lastSyncAt(2)).not.toBeNull();
  });

  it("does not record a successful synchronisation while the server is unreachable or the tablet is signed out", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    await engine.createClient(2, "Mai Tran", "6025550101");
    server.state.up = false;
    await engine.sync(server.transport, 2);
    expect(await engine.lastSyncAt(2)).toBeNull();
    server.state.up = true; server.state.signedIn = false;
    await engine.sync(server.transport, 2);
    expect(await engine.lastSyncAt(2)).toBeNull();
  });

  it("a request that times out is not a failure: the work is kept and sent once the server answers", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    await walkInOffline(engine);
    const slow: typeof server.transport = { send: async () => { throw new Unreachable("timed out"); } };
    for (let i = 0; i < 8; i++) expect((await engine.sync(slow, 2)).stopped).toBe("unreachable");
    expect((await engine.ops(2)).every((o) => o.state === "pending" && o.attempts === 0)).toBe(true);
    expect(await engine.sync(server.transport, 2)).toMatchObject({ synced: 3, pending: 0 });
  });

  it("when the tablet's storage is full the action FAILS and says so; nothing saved earlier is lost or cleared", async () => {
    const inner = memoryKV();
    const state = { broken: null as null | "QuotaExceededError" | "InvalidStateError" };
    const engine = new NailOffline(failingKV(inner, state));
    await walkInOffline(engine);
    state.broken = "QuotaExceededError";
    await expect(engine.createClient(2, "Second Client", "6025550102")).rejects.toThrow(/storage is full.*NOT saved/);
    expect(engine.storageProblem()).toMatchObject({ kind: "full" });
    expect(await engine.health()).toMatchObject({ ok: false });
    // No half-saved client, no half-queued operation, and the earlier work is all still there.
    expect((await engine.records(2)).map((r) => r.kind).sort()).toEqual(["client", "ticket", "walkin"]);
    expect((await engine.ops(2)).length).toBe(3);
    // Space is freed: it works again, and the problem clears itself.
    state.broken = null;
    expect(await engine.health()).toEqual({ ok: true });
    expect(engine.storageProblem()).toBeNull();
    await engine.createClient(2, "Second Client", "6025550102");
    expect((await engine.ops(2)).length).toBe(4);
  });

  it("a database that will not open is reported as unavailable, not hidden", async () => {
    const state = { broken: "InvalidStateError" as null | "QuotaExceededError" | "InvalidStateError" };
    const engine = new NailOffline(failingKV(memoryKV(), state));
    await expect(engine.checkIn(2, { id: 7, name: "Ana", phone: null })).rejects.toThrow(/could not save/);
    expect(engine.storageProblem()).toMatchObject({ kind: "unavailable" });
  });

  it("signing out removes what was read from the server but never unsent work", async () => {
    const server = fakeServer();
    const engine = new NailOffline(memoryKV());
    await engine.remember(2, "/api/nail/board", { tickets: [{ id: 900, client: { name: "Ana" } }] });
    await engine.remember(3, "/api/nail/board", { tickets: [] });
    await walkInOffline(engine);                                   // salon 2: unsent
    await engine.createClient(3, "Bo Lee", "6025550199");
    await engine.sync(server.transport, 3);                        // salon 3: everything sent
    await engine.onSignOut();
    expect(await engine.recall(2, "/api/nail/board")).toBeUndefined();
    expect(await engine.recall(3, "/api/nail/board")).toBeUndefined();
    // Salon 2's unsent walk-in is the only copy: kept. Salon 3 had nothing left to send: cleared.
    expect((await engine.records(2)).length).toBe(3);
    expect((await engine.counts(2)).pending).toBe(3);
    expect(await engine.records(3)).toHaveLength(0);
  });

  it("an overnight restart with no network: the same data, queue and cash are there when the app comes back", async () => {
    const kv = memoryKV();
    let clock = Date.parse("2026-10-10T04:30:00Z");                 // evening, salon time
    const evening = new NailOffline(kv, () => new Date(clock));
    await evening.remember(2, "/api/nail/board", { tickets: [], markers: [], dayBookings: [{ id: 41 }], techStats: [] });
    const { ticket } = await walkInOffline(evening);
    await evening.recordCash(2, { id: ticket.id, clientName: "Mai Tran" }, { totalPaid: 45, cash: 45, tip: 0, request: cashRequest(45), idempotencyKey: "k-overnight1" });
    // 3 AM: the app is restarted by the tablet. Still no network. A new engine over the same storage.
    clock = Date.parse("2026-10-10T10:00:00Z");
    const morning = new NailOffline(memoryKV(kv.data), () => new Date(clock));
    const down: Transport = { send: async () => { throw new Unreachable(); } };
    expect((await morning.sync(down, 2)).stopped).toBe("unreachable");
    expect(await morning.health()).toEqual({ ok: true });
    expect((await morning.recall<any>(2, "/api/nail/board"))?.data.dayBookings).toHaveLength(1);
    expect((await morning.recall<any>(2, "/api/nail/board"))?.at).toBe("2026-10-10T04:30:00.000Z");   // shown "as of" last night, not as fresh
    expect(await morning.counts(2)).toMatchObject({ pending: 4, cash: { count: 1, amount: 45 } });
  });
});

describe("phase 5: several tablets in one salon", () => {
  it("two tablets check in the same new client during an outage: one client, one waiting entry", async () => {
    const server = fakeServer();
    const front = new NailOffline(memoryKV()); const back = new NailOffline(memoryKV());
    for (const tablet of [front, back]) {
      const c = await tablet.createClient(2, "Mai Tran", "6025550101");
      await tablet.checkIn(2, { id: c.id, name: c.name, phone: c.phone });
    }
    expect(await front.sync(server.transport, 2)).toMatchObject({ synced: 2, attention: 0 });
    expect(await back.sync(server.transport, 2)).toMatchObject({ synced: 2, attention: 0 });
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.checkins).toHaveLength(1);
    // The second tablet's client now points at the real one the first tablet created.
    const mapped = (await back.records(2)).find((r) => r.kind === "client") as any;
    expect(mapped.realId).toBe(server.db.clients[0].id);
  });

  it("two tablets each make a ticket for different walk-ins: two tickets, nothing doubled on retry", async () => {
    const server = fakeServer();
    const front = new NailOffline(memoryKV()); const back = new NailOffline(memoryKV());
    const a = await front.createClient(2, "Mai Tran", "6025550101");
    await front.createTicket(ticketInput(a.id, null));
    const b = await back.createClient(2, "Bo Lee", "6025550199");
    await back.createTicket({ ...ticketInput(b.id, null), clientName: "Bo Lee" });
    server.state.dropReplies = 2;
    for (let i = 0; i < 4; i++) { await front.sync(server.transport, 2); await back.sync(server.transport, 2); }
    expect(server.db.clients).toHaveLength(2);
    expect(server.db.tickets).toHaveLength(2);
    expect(new Set(server.db.tickets.map((t) => t.clientId)).size).toBe(2);
  });

  it("competing technician changes: the second tablet is told who has the ticket, and neither choice is overwritten", async () => {
    const server = fakeServer();
    const t = serverTicket(server);                                  // unassigned on the server
    const front = new NailOffline(memoryKV()); const back = new NailOffline(memoryKV());
    await front.changeServerTicket(2, { id: t.id, clientName: "Ana", status: "confirmed", staffId: null }, { type: "reassign", staff: { id: 8, name: "Kim", color: null } });
    await back.changeServerTicket(2, { id: t.id, clientName: "Ana", status: "confirmed", staffId: null }, { type: "reassign", staff: { id: 9, name: "Lan", color: null } });
    await front.sync(server.transport, 2);
    expect(await back.sync(server.transport, 2)).toMatchObject({ synced: 0, attention: 1 });
    expect(server.db.tickets[0].staffId).toBe(8);                    // the server keeps the first
    const [held] = (await back.ops(2)).filter((o) => o.state === "attention");
    expect(held).toMatchObject({ type: "ticket.reassign", conflict: true });
    expect(held.lastError).toMatch(/given to Kim on another device/);
    // The second tablet still holds its own choice for staff to resolve.
    expect(((await back.records(2)).find((r) => r.kind === "patch") as any).staff.id).toBe(9);
  });

  it("the same tablet moving a ticket twice is not a conflict with itself", async () => {
    const server = fakeServer();
    const t = serverTicket(server);
    const tablet = new NailOffline(memoryKV());
    await tablet.changeServerTicket(2, { id: t.id, clientName: "Ana", status: "confirmed", staffId: null }, { type: "reassign", staff: { id: 8, name: "Kim", color: null } });
    await tablet.sync(server.transport, 2);
    await tablet.changeServerTicket(2, { id: t.id, clientName: "Ana" }, { type: "reassign", staff: { id: 9, name: "Lan", color: null } });
    expect(await tablet.sync(server.transport, 2)).toMatchObject({ synced: 1, attention: 0 });
    expect(server.db.tickets[0].staffId).toBe(9);
  });

  it("a tablet that was offline cannot reopen or cancel a ticket another tablet already checked out", async () => {
    const server = fakeServer();
    const a = serverTicket(server); const b = serverTicket(server);
    const stale = new NailOffline(memoryKV());
    await stale.changeServerTicket(2, { id: a.id, clientName: "Ana", status: "confirmed", staffId: null }, { type: "start" });
    await stale.changeServerTicket(2, { id: b.id, clientName: "Bo", status: "confirmed", staffId: null }, { type: "cancel" });
    a.status = "completed"; b.status = "completed";                  // both were paid on the other tablet meanwhile
    expect(await stale.sync(server.transport, 2)).toMatchObject({ synced: 0, attention: 2 });
    expect(server.db.tickets.map((t) => t.status)).toEqual(["completed", "completed"]);
    for (const op of (await stale.ops(2))) expect(op).toMatchObject({ state: "attention", conflict: true });
  });

  it("starting a ticket someone else already started is simply accepted (same outcome, no conflict)", async () => {
    const server = fakeServer();
    const a = serverTicket(server);
    const tablet = new NailOffline(memoryKV());
    await tablet.changeServerTicket(2, { id: a.id, clientName: "Ana", status: "confirmed", staffId: null }, { type: "start" });
    a.status = "started";
    expect(await tablet.sync(server.transport, 2)).toMatchObject({ synced: 1, attention: 0 });
  });

  it("starting then cancelling on one tablet goes through in order", async () => {
    const server = fakeServer();
    const a = serverTicket(server);
    const tablet = new NailOffline(memoryKV());
    await tablet.changeServerTicket(2, { id: a.id, clientName: "Ana", status: "confirmed", staffId: null }, { type: "start" });
    await tablet.changeServerTicket(2, { id: a.id, clientName: "Ana" }, { type: "cancel" });
    expect(await tablet.sync(server.transport, 2)).toMatchObject({ synced: 2, attention: 0 });
    expect(server.db.tickets[0].status).toBe("cancelled");
  });

  it("when a client cannot be created, the ticket that needs them waits — it is not sent with a wrong client, and not lost", async () => {
    const server = fakeServer();
    const tablet = new NailOffline(memoryKV());
    const { ticket } = await walkInOffline(tablet);
    // The server refuses the client outright (say the name failed a rule).
    const refuseClient: Transport = { send: async (m, url, body, key) => (url === "/api/customers" ? { status: 400, body: { message: "Invalid input" } } : server.transport.send(m, url, body, key)) };
    expect(await tablet.sync(refuseClient, 2)).toMatchObject({ synced: 0, attention: 1 });
    expect(server.db.tickets).toHaveLength(0);
    const ops = await tablet.ops(2);
    expect(ops.find((o) => o.type === "ticket.create")).toMatchObject({ state: "pending", attempts: 0 });
    // Fixed (retry) → the client is created and the ticket follows with the right, real client id.
    await tablet.retry(ops.find((o) => o.type === "client.create")!.id);
    expect(await tablet.sync(server.transport, 2)).toMatchObject({ synced: 3, attention: 0, pending: 0 });
    expect(server.db.tickets[0].clientId).toBe(server.db.clients[0].id);
    expect(((await tablet.records(2)).find((r) => r.id === ticket.id) as any).realId).toBe(server.db.tickets[0].id);
  });

  it("a partial sync is picked up where it stopped, without repeating what already went through", async () => {
    const server = fakeServer();
    const tablet = new NailOffline(memoryKV());
    await walkInOffline(tablet);
    let sent = 0;
    const cutsOut: Transport = { send: async (m, url, body, key) => { if (m !== "GET" && ++sent > 1) throw new Unreachable("connection dropped"); return server.transport.send(m, url, body, key); } };
    expect(await tablet.sync(cutsOut, 2)).toMatchObject({ synced: 1, stopped: "unreachable", pending: 2 });
    expect(await tablet.sync(server.transport, 2)).toMatchObject({ synced: 2, pending: 0 });
    expect(server.db.clients).toHaveLength(1);
    expect(server.db.checkins).toHaveLength(1);
    expect(server.db.tickets).toHaveLength(1);
  });
});
