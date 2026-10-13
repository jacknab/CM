import { describe, expect, it } from "vitest";
import { commonOfflineTech, computeOfflineLine, eventsFromDevice, type BaseLine, type LineEvent } from "./line";
import type { LocalRecord } from "./engine";

// The line as the server last sent it: Amy, Lisa, Maria in the line; Jenny not clocked in.
const tech = (id: number, name: string, turnPosition: number, more: Record<string, unknown> = {}) =>
  ({ id, name, clockedIn: true, paused: false, turnPosition, turnUnits: 0, turnScore: 0, exclusionReasons: [], ...more });
const base = (mode: string, more: Record<string, unknown> = {}): BaseLine => ({
  technicians: [tech(1, "Amy", 0), tech(2, "Lisa", 1), tech(3, "Maria", 2), tech(4, "Jenny", 999, { clockedIn: false })],
  turnRules: { mode: mode as any, dollarsPerTurn: 30, partialTurnValue: 0.5 },
  settings: { turnEnabled: true },
  turnPeriodStart: new Date(0).toISOString(),
  ...more,
});
const MANI = 10, PEDI = 20;
const skills = new Map<number, Set<number>>([[1, new Set([MANI, PEDI])], [2, new Set([MANI])], [3, new Set([MANI, PEDI])], [4, new Set([MANI, PEDI])]]);
const line = (b: BaseLine, events: LineEvent[] = [], openTickets: { staffId: number | null; status: string }[] = [], serviceId: number | null = MANI) =>
  computeOfflineLine({ base: b, serviceId, skills, openTickets, events });
const names = (l: ReturnType<typeof line>) => l.eligibleTechnicians.map((t) => t.name);

describe("who can take a client offline", () => {
  it("never offers a technician who is not clocked in", () => {
    const l = line(base("classic"));
    expect(names(l)).toEqual(["Amy", "Lisa", "Maria"]);
    expect(l.technicians.find((t) => t.name === "Jenny")).toMatchObject({ eligible: false, exclusionReasons: ["not_clocked_in"], availabilityState: "off" });
  });
  it("never offers a technician who does not perform the service", () => {
    const l = line(base("classic"), [], [], PEDI);
    expect(names(l)).toEqual(["Amy", "Maria"]);
    expect(l.technicians.find((t) => t.name === "Lisa")!.exclusionReasons).toEqual(["service_not_supported"]);
  });
  it("never offers a technician who is with a client, or on a break", () => {
    const b = base("classic");
    b.technicians[2].paused = true;
    const l = line(b, [], [{ staffId: 1, status: "started" }]);
    expect(names(l)).toEqual(["Lisa"]);
    expect(l.technicians.find((t) => t.name === "Amy")).toMatchObject({ inService: true, currentStatus: "busy" });
    expect(l.technicians.find((t) => t.name === "Maria")).toMatchObject({ currentStatus: "on_break" });
  });
  it("follows clock-ins and clock-outs made on this device", () => {
    const l = line(base("classic"), [{ kind: "clock_in", at: 5, staffId: 4 }, { kind: "clock_out", at: 6, staffId: 1 }]);
    expect(names(l)).toEqual(["Lisa", "Maria", "Jenny"]);
    expect(l.technicians.find((t) => t.name === "Amy")!.exclusionReasons).toContain("not_clocked_in");
  });
  it("falls back to the server's last word on skills when the device does not hold them", () => {
    const b = base("classic");
    b.technicians[0].supportsService = false;
    expect(computeOfflineLine({ base: b, serviceId: PEDI, skills: null, openTickets: [], events: [] }).eligibleTechnicians.map((t) => t.name)).toEqual(["Lisa", "Maria"]);
  });
});

describe("the rotation moves on offline", () => {
  it("gives three walk-ins in a row to three different technicians", () => {
    const events: LineEvent[] = [];
    const open: { staffId: number; status: string }[] = [];
    const served: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = line(base("dollar"), events, open).eligibleTechnicians[0];
      served.push(next.name);
      events.push({ kind: "assigned", at: 10 + i, staffId: next.id });
      open.push({ staffId: next.id, status: "confirmed" });
    }
    expect(served).toEqual(["Amy", "Lisa", "Maria"]);
    expect(names(line(base("dollar"), events, open))).toEqual([]);
  });
  it("Dollar-Based Turns: a paid ticket earns its turns and the technician goes behind those with fewer", () => {
    // Amy took a $65 ticket (2 turns), Lisa a $20 ticket (½). Everyone is free again.
    const events: LineEvent[] = [
      { kind: "assigned", at: 1, staffId: 1 }, { kind: "assigned", at: 2, staffId: 2 },
      { kind: "paid", at: 3, staffId: 1, serviceAmount: 65 }, { kind: "paid", at: 4, staffId: 2, serviceAmount: 20 },
    ];
    const l = line(base("dollar"), events);
    expect(names(l)).toEqual(["Maria", "Lisa", "Amy"]);
    expect(l.technicians.map((t) => [t.name, t.turnUnits])).toEqual([["Maria", 0], ["Lisa", 500], ["Amy", 2000], ["Jenny", 0]]);
  });
  it("Counted Turns: a short turn earns nothing and holds the technician at the front", () => {
    const events: LineEvent[] = [{ kind: "assigned", at: 1, staffId: 2 }, { kind: "paid", at: 2, staffId: 2, serviceAmount: 20 }];
    const l = line(base("classic"), events);
    expect(names(l)[0]).toBe("Lisa");
    expect(l.technicians[0]).toMatchObject({ name: "Lisa", shortTurnProtected: true, turnUnits: 0 });
  });
  it("Counted Turns: a full turn sends the technician to the back", () => {
    const l = line(base("classic"), [{ kind: "assigned", at: 1, staffId: 1 }, { kind: "paid", at: 2, staffId: 1, serviceAmount: 45 }]);
    expect(names(l)).toEqual(["Lisa", "Maria", "Amy"]);
  });
  it("fixed order: whoever took a turn longest ago is next, whatever the tickets cost", () => {
    const events: LineEvent[] = [];
    const served: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = line(base("round_robin"), events).eligibleTechnicians[0];
      served.push(next.name);
      events.push({ kind: "assigned", at: 100 + i * 10, staffId: next.id }, { kind: "paid", at: 105 + i * 10, staffId: next.id, serviceAmount: i === 0 ? 200 : 15 });
    }
    expect(served).toEqual(["Amy", "Lisa", "Maria", "Amy", "Lisa", "Maria"]);
  });
  it("equal clients: one client per paid ticket", () => {
    const l = line(base("client_count"), [{ kind: "assigned", at: 1, staffId: 1 }, { kind: "paid", at: 2, staffId: 1, serviceAmount: 200 }]);
    expect(names(l)).toEqual(["Lisa", "Maria", "Amy"]);
    expect(l.technicians.find((t) => t.name === "Amy")!.turnCount).toBe(1);
  });
  it("a cancelled ticket gives the technician their place back, with no turn", () => {
    const l = line(base("dollar"), [{ kind: "assigned", at: 1, staffId: 1 }, { kind: "released", at: 2, staffId: 1 }]);
    expect(names(l)).toEqual(["Amy", "Lisa", "Maria"]);
    expect(l.technicians[0].turnUnits).toBe(0);
  });
  it("an unpaid completion earns nothing and costs nothing", () => {
    const l = line(base("dollar"), [{ kind: "assigned", at: 1, staffId: 2 }, { kind: "paid", at: 2, staffId: 2, serviceAmount: 0 }]);
    expect(names(l)[0]).toBe("Lisa");
  });
  it("counts on top of what the server had already credited", () => {
    const b = base("dollar");
    b.technicians[0].turnUnits = 1000; b.technicians[0].turnScore = 1000; b.technicians[0].turnPosition = 2;
    b.technicians[1].turnPosition = 0; b.technicians[2].turnPosition = 1;
    const l = line(b, [{ kind: "assigned", at: 1, staffId: 2 }, { kind: "paid", at: 2, staffId: 2, serviceAmount: 65 }]);
    expect(names(l)).toEqual(["Maria", "Amy", "Lisa"]);
  });
  it("a late joiner starts level with the lowest technician where the salon says so", () => {
    const b = base("dollar", { turnRules: { mode: "dollar", dollarsPerTurn: 30, partialTurnValue: 0.5, lateJoin: "level" } });
    for (const t of b.technicians.slice(0, 3)) { t.turnUnits = 2000; t.turnScore = 2000; }
    const l = line(b, [{ kind: "clock_in", at: 9, staffId: 4 }]);
    expect(names(l)).toEqual(["Amy", "Lisa", "Maria", "Jenny"]);
    expect(names(line(base("dollar"), [{ kind: "clock_in", at: 9, staffId: 4 }]))).toEqual(["Amy", "Lisa", "Maria", "Jenny"]);
  });
  it("tells each technician their place, and only one that they are next", () => {
    const l = line(base("dollar"), [], [{ staffId: 1, status: "started" }]);
    expect(l.technicians.map((t) => t.lineMessage)).toEqual([
      "Passed over for now — with a client. Your place is kept.", "You're next.", "1 technician ahead of you.", "Not in the line — clock in to join.",
    ]);
  });
});

describe("one technician for a two-service visit", () => {
  it("picks the first in line who can do both", () => {
    const mani = line(base("classic"), [], [], MANI), pedi = line(base("classic"), [], [], PEDI);
    expect(commonOfflineTech([mani, pedi])?.name).toBe("Amy");
    const amyBusy = [{ staffId: 1, status: "started" }];
    expect(commonOfflineTech([line(base("classic"), [], amyBusy, MANI), line(base("classic"), [], amyBusy, PEDI)])?.name).toBe("Maria");
  });
  it("is nobody when no single technician can", () => {
    const only = new Map<number, Set<number>>([[1, new Set([MANI])], [2, new Set([PEDI])], [3, new Set([MANI])]]);
    const l = (sid: number) => computeOfflineLine({ base: base("classic"), serviceId: sid, skills: only, openTickets: [], events: [] });
    expect(commonOfflineTech([l(MANI), l(PEDI)])).toBeNull();
  });
});

describe("what the device did since the server's last line", () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const ticket = (id: number, staffId: number | null, createdMs: number, paid?: { at: number; serviceRevenue?: number; totalPaid: number; tip?: number }): LocalRecord => ({
    kind: "ticket", id, storeId: 1, clientId: 5, clientName: "C", phone: null, walkinId: null,
    service: { id: MANI, name: "Mani", price: 40, duration: 30 }, addons: [], nail: null, nailLines: [], nailPriceAdjustment: 0, customLines: [],
    staff: staffId ? { id: staffId, name: "T", color: null } : null, status: "confirmed", startedAt: null, total: 40, duration: 30, createdAt: iso(createdMs),
    ...(paid ? { paid: { at: iso(paid.at), totalPaid: paid.totalPaid, cash: paid.totalPaid, tip: paid.tip ?? 0, request: paid.serviceRevenue != null ? { serviceRevenue: paid.serviceRevenue } : {} } } : {}),
  });
  const SINCE = 1_000_000;
  const run = (records: LocalRecord[], punches: { action: string; staffId: number; at: number }[] = [], staffOnBoard = new Map<number, number | null>()) =>
    eventsFromDevice({ records, since: SINCE, staffOnBoard, punches });

  it("ignores what the server had already counted before it sent the line", () => {
    expect(run([ticket(-1, 1, SINCE - 5000, { at: SINCE - 1000, totalPaid: 40 })])).toEqual([]);
  });
  it("turns a ticket made and paid here into an assignment and a payment of the service amount (not the tip)", () => {
    expect(run([ticket(-1, 2, SINCE + 10, { at: SINCE + 500, serviceRevenue: 35, totalPaid: 45, tip: 10 })])).toEqual([
      { kind: "assigned", at: SINCE + 10, staffId: 2 }, { kind: "paid", at: SINCE + 500, staffId: 2, serviceAmount: 35 },
    ]);
  });
  it("an unassigned ticket moves nobody", () => {
    expect(run([ticket(-1, null, SINCE + 10)])).toEqual([]);
  });
  it("a server ticket moved, cancelled or paid here frees and credits the right technicians", () => {
    const patch = (more: Record<string, unknown>): LocalRecord => ({ kind: "patch", id: -9, storeId: 1, ticketId: 77, clientName: "C", createdAt: iso(SINCE + 100), ...more } as LocalRecord);
    expect(run([patch({ seen: { staffId: 1 }, staff: { id: 3, name: "Maria", color: null } })])).toEqual([
      { kind: "assigned", at: SINCE + 100, staffId: 3 }, { kind: "released", at: SINCE + 100, staffId: 1 },
    ]);
    expect(run([patch({ status: "cancelled" })], [], new Map([[77, 2]]))).toEqual([{ kind: "released", at: SINCE + 101, staffId: 2 }]);
    expect(run([patch({ seen: { staffId: 1 }, paid: { at: iso(SINCE + 900), totalPaid: 60, cash: 60, tip: 0, request: { serviceRevenue: 60 } } })])).toEqual([
      { kind: "paid", at: SINCE + 900, staffId: 1, serviceAmount: 60 },
    ]);
  });
  it("end to end: three walk-ins, one paid — the line the next client sees", () => {
    const records = [ticket(-1, 1, SINCE + 10, { at: SINCE + 400, serviceRevenue: 65, totalPaid: 65 }), ticket(-2, 2, SINCE + 20), ticket(-3, null, SINCE + 30)];
    const events = run(records, [{ action: "clock_in", staffId: 4, at: SINCE + 50 }]);
    const l = computeOfflineLine({ base: base("dollar"), serviceId: MANI, skills, events, openTickets: [{ staffId: 2, status: "confirmed" }, { staffId: null, status: "confirmed" }] });
    // Lisa holds a client; Amy has 2 turns; Maria and Jenny (just clocked in) have none — Maria has waited longer.
    expect(l.eligibleTechnicians.map((t) => t.name)).toEqual(["Maria", "Jenny", "Amy"]);
  });
});
