import { describe, it, expect } from "vitest";
import { NailOffline, Unreachable, type Reply, type Transport } from "./engine";
import { memoryKV } from "./store";

/**
 * /barber, offline (plans/barber-offline.md, step 2): a barber takes a waiting client (a walk-in, no ticket) with
 * no server, and it reaches the server once, after the walk-in it depends on.
 */
function fakeServer() {
  const checkins = new Map<number, { clientId: number; staffId: number | null }>([[700, { clientId: 50, staffId: null }]]);
  const keys = new Map<string, Reply>();
  const state = { up: true, dropReplies: 0, calls: [] as string[] };
  let seq = 800;
  const handle = (method: string, url: string, body: any): Reply => {
    if (url === "/api/nail/checkin") {
      const id = ++seq;
      checkins.set(id, { clientId: body.clientId, staffId: null });
      return { status: 200, body: { status: "walkin", checkin: { id, ticketNumber: body.ticketNumber ?? 1 } } };
    }
    const take = /^\/api\/nail\/markers\/(\d+)\/assign$/.exec(url);
    if (take && method === "POST") {
      const k = checkins.get(Number(take[1]));
      if (!k) return { status: 404, body: { message: "Not found" } };
      // As nailTickets.assignMarkerToBarber: the same barber again is fine, anyone else is refused.
      if (k.staffId != null && k.staffId !== body.staffId) return { status: 409, body: { message: "This client was already taken or is no longer waiting." } };
      k.staffId = body.staffId;
      return { status: 200, body: { staffName: "Leo" } };
    }
    return { status: 404, body: { message: `no route ${method} ${url}` } };
  };
  const transport: Transport = {
    async send(method, url, body, key) {
      state.calls.push(`${method} ${url}`);
      if (!state.up) throw new Unreachable();
      let reply = key ? keys.get(key) : undefined;
      if (!reply) {
        reply = handle(method, url, body);
        if (key && reply.status < 300) keys.set(key, reply);
      }
      if (state.dropReplies > 0) { state.dropReplies -= 1; throw new Unreachable("reply lost"); }
      return reply;
    },
  };
  return { checkins, state, transport };
}

const leo = { id: 9, name: "Leo Park", color: null };
const kim = { id: 4, name: "Kim Vo", color: null };

describe("a barber takes a waiting client offline", () => {
  it("takes a client the server already had, and tells the server once the connection is back", async () => {
    const engine = new NailOffline(memoryKV());
    const server = fakeServer();
    await engine.takeWalkin(38, { id: 700, clientName: "Ana" }, leo);
    expect(await engine.counts(38)).toMatchObject({ pending: 1 });

    server.state.up = false;
    expect((await engine.sync(server.transport, 38)).stopped).toBe("unreachable");
    expect(server.checkins.get(700)!.staffId).toBeNull();

    server.state.up = true;
    await engine.sync(server.transport, 38);
    expect(server.checkins.get(700)!.staffId).toBe(9);
    expect(await engine.counts(38)).toMatchObject({ pending: 0, attention: 0 });
  });

  it("sends a take of a walk-in made on this tablet only after the walk-in, under its server id", async () => {
    const engine = new NailOffline(memoryKV());
    const server = fakeServer();
    const { walkin } = await engine.checkIn(38, { id: 50, name: "Ana", phone: "6025550101" });
    await engine.takeWalkin(38, { id: walkin.id, clientName: "Ana" }, leo);
    await engine.sync(server.transport, 38);
    expect(server.state.calls).toEqual(["POST /api/nail/checkin", "POST /api/nail/markers/801/assign"]);
    expect(server.checkins.get(801)!.staffId).toBe(9);
  });

  it("is done once when the answer is lost and it is sent again", async () => {
    const engine = new NailOffline(memoryKV());
    const server = fakeServer();
    await engine.takeWalkin(38, { id: 700, clientName: "Ana" }, leo);
    server.state.dropReplies = 1;
    await engine.sync(server.transport, 38);
    await engine.sync(server.transport, 38);
    expect(server.checkins.get(700)!.staffId).toBe(9);
    expect(await engine.counts(38)).toMatchObject({ pending: 0, attention: 0 });
  });

  it("one barber per client on the tablet: taking again is the same take, another barber is refused", async () => {
    const engine = new NailOffline(memoryKV());
    const first = await engine.takeWalkin(38, { id: 700, clientName: "Ana" }, leo);
    expect((await engine.takeWalkin(38, { id: 700, clientName: "Ana" }, leo)).id).toBe(first.id);
    await expect(engine.takeWalkin(38, { id: 700, clientName: "Ana" }, kim)).rejects.toThrow("already taken by Leo Park");
  });

  it("holds it for attention when another tablet's barber got the client first", async () => {
    const engine = new NailOffline(memoryKV());
    const server = fakeServer();
    server.checkins.get(700)!.staffId = 4;
    await engine.takeWalkin(38, { id: 700, clientName: "Ana" }, leo);
    await engine.sync(server.transport, 38);
    const [op] = await engine.ops(38);
    expect(op).toMatchObject({ state: "attention", conflict: true, lastError: "This client was already taken or is no longer waiting." });
  });

  it("taking back a walk-in made on this tablet takes back its take too", async () => {
    const engine = new NailOffline(memoryKV());
    const { walkin } = await engine.checkIn(38, { id: 50, name: "Ana", phone: null });
    await engine.takeWalkin(38, { id: walkin.id, clientName: "Ana" }, leo);
    await engine.cancel(walkin.id);
    expect(await engine.records(38)).toEqual([]);
    expect(await engine.ops(38)).toEqual([]);
  });

  it("refuses a walk-in made here that is no longer waiting", async () => {
    const engine = new NailOffline(memoryKV());
    await expect(engine.takeWalkin(38, { id: -5, clientName: "Ana" }, leo)).rejects.toThrow("no longer waiting");
  });
});
