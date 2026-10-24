import { describe, expect, it } from "vitest";
import { computeOfflineLine, eventsFromDevice, mergeSharedTurns, turnsEarnedOffline, type BaseLine, type LineEvent } from "./line";

// Two POS tablets, both offline. Each had the server's line at time 1000: Amy, Lisa, Maria.
const tech = (id: number, name: string, turnPosition: number) =>
  ({ id, name, clockedIn: true, paused: false, turnPosition, turnUnits: 0, turnScore: 0, exclusionReasons: [] });
const base: BaseLine = {
  technicians: [tech(1, "Amy", 0), tech(2, "Lisa", 1), tech(3, "Maria", 2)],
  turnRules: { mode: "dollar" as any, dollarsPerTurn: 30, partialTurnValue: 0.5 },
  settings: { turnEnabled: true },
  turnPeriodStart: new Date(0).toISOString(),
};
const SINCE = 1000;
const skills = new Map<number, Set<number>>([[1, new Set([10])], [2, new Set([10])], [3, new Set([10])]]);

/** Tablet B's line, given what tablet A sent and what B itself did and holds. */
function lineOnB(foreign: LineEvent[], own: LineEvent[] = [], open: { id?: number; staffId: number | null; status: string }[] = []) {
  const merged = mergeSharedTurns({ events: own, openTickets: open, foreign: [foreign], since: SINCE });
  return computeOfflineLine({ base, serviceId: 10, skills, openTickets: merged.openTickets, events: merged.events });
}
const next = (l: ReturnType<typeof lineOnB>) => l.eligibleTechnicians.map((t) => t.name);

describe("two POS tablets offline share one turn line", () => {
  it("a client tablet A gave to Amy: on tablet B, Amy is busy and Lisa is next", () => {
    const l = lineOnB([{ kind: "assigned", at: 2000, staffId: 1, ticketId: -5 }]);
    expect(next(l)).toEqual(["Lisa", "Maria"]);
    expect(l.technicians.find((t) => t.name === "Amy")).toMatchObject({ eligible: false, currentStatus: "busy" });
  });

  it("tablet A paid Amy's ticket: on tablet B she is free again, at the back with her turn", () => {
    const l = lineOnB([
      { kind: "assigned", at: 2000, staffId: 1, ticketId: -5 },
      { kind: "paid", at: 3000, staffId: 1, serviceAmount: 30, ticketId: -5 },
    ]);
    expect(next(l)).toEqual(["Lisa", "Maria", "Amy"]);
    expect(l.technicians.find((t) => t.name === "Amy")!.turnUnits).toBe(1000); // $30 at $30 a turn is 1 turn
  });

  it("a server ticket tablet A paid is no longer open on tablet B, even though B's copy of the board still shows it", () => {
    const l = lineOnB(
      [{ kind: "paid", at: 3000, staffId: 2, serviceAmount: 30, ticketId: 77 }],
      [],
      [{ id: 77, staffId: 2, status: "started" }],   // B's board, saved before the outage
    );
    expect(l.technicians.find((t) => t.name === "Lisa")).toMatchObject({ eligible: true });
  });

  it("both tablets' clients count: A gave one to Amy, B one to Lisa — Maria is next on B", () => {
    const l = lineOnB(
      [{ kind: "assigned", at: 2000, staffId: 1, ticketId: -5 }],
      [{ kind: "assigned", at: 2500, staffId: 2, ticketId: -9 }],
      [{ id: -9, staffId: 2, status: "confirmed" }],
    );
    expect(next(l)).toEqual(["Maria"]);
  });

  it("what tablet A did before B's own server line is not counted twice", () => {
    const l = lineOnB([{ kind: "assigned", at: 500, staffId: 1, ticketId: 12 }]);
    expect(next(l)).toEqual(["Amy", "Lisa", "Maria"]);
  });

  it("a technician tablet A clocked out leaves the line on B too", () => {
    const l = lineOnB([{ kind: "clock_out", at: 2000, staffId: 3 }]);
    expect(next(l)).toEqual(["Amy", "Lisa"]);
  });
});

describe("a manager's turn change made offline", () => {
  const line = (events: LineEvent[], mode = "dollar") =>
    computeOfflineLine({ base: { ...base, turnRules: { ...base.turnRules, mode: mode as any } }, serviceId: 10, skills, openTickets: [], events });

  it("+1 turn counts at once: Amy goes behind Lisa and Maria", () => {
    const l = line([{ kind: "adjusted", at: 2000, staffId: 1, units: 1000 }]);
    expect(next(l)).toEqual(["Lisa", "Maria", "Amy"]);
    expect(l.technicians.find((t) => t.name === "Amy")!.turnUnits).toBe(1000);
  });

  it("−1 turn brings Maria to the front", () => {
    expect(next(line([{ kind: "adjusted", at: 2000, staffId: 3, units: -1000 }]))).toEqual(["Maria", "Amy", "Lisa"]);
  });

  it("in fixed order it sends the technician to the back", () => {
    expect(next(line([{ kind: "adjusted", at: 2000, staffId: 1, units: 1000 }], "round_robin"))).toEqual(["Lisa", "Maria", "Amy"]);
  });

  it("a change still waiting to be sent is one of the tablet's events, whenever it was made", () => {
    expect(eventsFromDevice({ records: [], since: SINCE, staffOnBoard: new Map(), punches: [], adjustments: [{ staffId: 2, units: 500, at: 10 }] }))
      .toEqual([{ kind: "adjusted", at: 10, staffId: 2, units: 500 }]);
  });
});

describe("turns earned, shown after a sale paid offline", () => {
  const sale = { appointmentId: -3, ticketNumber: 12, staffName: "Amy", walkIn: true, serviceRevenue: 45, productRevenue: 10, totalPaid: 65, tip: 10 };

  it("a walk-in: the service part only, under the same rules the server uses ($45 at $30 a turn is 1½)", () => {
    expect(turnsEarnedOffline({ base, tickets: [sale] })).toEqual([
      { appointmentId: -3, ticketNumber: 12, staffName: "Amy", mode: "dollar", earned: 1.5, serviceAmount: 45 },
    ]);
  });

  it("a paid Counted Turns checkout under the threshold earns 1/2", () => {
    const classicBase = { ...base, turnRules: { mode: "classic" as const, dollarsPerTurn: 30, partialTurnValue: 0.5 } };
    expect(turnsEarnedOffline({ base: classicBase, tickets: [{ ...sale, serviceRevenue: 20 }] })).toEqual([
      { appointmentId: -3, ticketNumber: 12, staffName: "Amy", mode: "classic", earned: 0.5, serviceAmount: 20 },
    ]);
  });

  it("an advance booking, a ticket with no technician, or one that earned nothing: not shown", () => {
    expect(turnsEarnedOffline({ base, tickets: [{ ...sale, walkIn: false }, { ...sale, staffName: null }, { ...sale, serviceRevenue: 0 }] })).toEqual([]);
  });

  it("nothing when the salon has the turn system off", () => {
    expect(turnsEarnedOffline({ base: { ...base, settings: { turnEnabled: false } }, tickets: [sale] })).toEqual([]);
  });
});
