import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRACKETS, TURN_UNIT, explainAssignment, formatTurns, lineMessage, normalizeTurnRules, rankTurnLine,
  turnAmount, turnRulesToSettings, turnUnits, type ConsideredTechnician, type TurnRules,
} from "@shared/turnRules";

const rules = (settings: Record<string, unknown>): TurnRules => normalizeTurnRules(settings);
// The amounts every dollar method must give a defined answer for.
const AMOUNTS = [0, 15, 29.99, 30, 30.01, 45, 60, 60.01, 5000];
const units = (r: TurnRules) => AMOUNTS.map((a) => turnUnits(r, a));

describe("dollar brackets (under $30 → ½, from $30 → 1, from $60 → 2)", () => {
  const atOrOver = rules({ turnMode: "brackets", turnBrackets: DEFAULT_BRACKETS, turnBoundary: "at_or_over" });
  const over = rules({ turnMode: "brackets", turnBrackets: DEFAULT_BRACKETS, turnBoundary: "over" });
  it("puts exactly $30 and exactly $60 in the higher bracket when the boundary is 'at or over'", () => {
    expect(units(atOrOver)).toEqual([0, 500, 500, 1000, 1000, 1000, 2000, 2000, 2000]);
  });
  it("puts exactly $30 and exactly $60 in the lower bracket when the boundary is 'over'", () => {
    expect(units(over)).toEqual([0, 500, 500, 500, 1000, 1000, 1000, 2000, 2000]);
  });
  it("gives every amount an answer even when the salon's first bracket starts above $0", () => {
    const r = rules({ turnMode: "brackets", turnBrackets: [{ fromCents: 2000, units: 1000 }] });
    expect(r.brackets![0]).toEqual({ fromCents: 0, units: 0 });
    expect(turnUnits(r, 10)).toBe(500);
    expect(turnUnits(r, 20)).toBe(1000);
  });
  it("gives 1/2 turn when a positive ticket's configured method would otherwise earn zero", () => {
    expect(turnUnits(rules({ turnMode: "dollar", partialTurnValue: 0 }), 20)).toBe(500);
    expect(turnUnits(rules({ turnMode: "brackets", turnBrackets: [{ fromCents: 0, units: 0 }] }), 20)).toBe(500);
  });
  it("keeps one bracket per amount, sorted, and drops nonsense", () => {
    const r = rules({ turnMode: "brackets", turnBrackets: [{ fromCents: 6000, units: 2000 }, { fromCents: 0, units: 500 }, { fromCents: -5, units: 1 }, { fromCents: 6000, units: 3000 }, "x"] });
    expect(r.brackets).toEqual([{ fromCents: 0, units: 500 }, { fromCents: 6000, units: 3000 }]);
  });
});

describe("proportional ($30 a turn)", () => {
  const r = rules({ turnMode: "proportional", turnValueThreshold: 30 });
  it("earns each dollar's share of a turn", () => {
    expect(units(r)).toEqual([0, 500, 1000, 1000, 1000, 1500, 2000, 2000, 166667]);
    expect(turnUnits(r, 65)).toBe(2167);
    expect(turnUnits(r, 29.99)).toBe(1000); // 999.67 thousandths rounds to one turn
  });
  it("is a different answer from brackets for the same ticket", () => {
    expect(turnUnits(r, 45)).not.toBe(turnUnits(rules({ turnMode: "brackets" }), 45));
  });
});

describe("the two original presets are unchanged", () => {
  it("Dollar-Based Turns (the owner's rule, corrected 2026-10-24: ½ under the threshold, then whole turns plus ½ for any rest)", () => {
    expect(units(rules({ turnMode: "dollar" }))).toEqual([0, 500, 500, 1000, 1500, 1500, 2000, 2500, 166500]);
  });
  it("Counted Turns", () => {
    expect(units(rules({ turnMode: "classic" }))).toEqual([0, 500, 500, 1000, 1000, 1000, 1000, 1000, 1000]);
    expect(rules({}).mode).toBe("classic");
  });
});

describe("equal clients and fixed order ignore the price", () => {
  it("counts one for any paid ticket and nothing for an unpaid one", () => {
    for (const mode of ["client_count", "round_robin"]) {
      expect(units(rules({ turnMode: mode }))).toEqual([0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    }
  });
});

describe("whole-number turn units", () => {
  it("adds halves without drift", () => {
    const r = rules({ turnMode: "dollar" });
    let total = 0;
    for (let i = 0; i < 7; i++) total += turnUnits(r, 20);
    expect(total).toBe(3500);
    expect(formatTurns(total)).toBe("3 1/2");
  });
  it("writes turns the way staff say them", () => {
    expect([0, 500, 1000, 1500, 2167, 250].map(formatTurns)).toEqual(["0", "1/2", "1", "1 1/2", "2.17", "0.25"]);
  });
});

describe("which amount earns turns", () => {
  const ticket = { serviceRevenue: "60.00", productRevenue: "20.00", totalPaid: "70.00", tipAmount: "10.00", discountAmount: "20.00" };
  it("is the services as priced by default — tip, retail and discount do not change it", () => {
    expect(turnAmount(ticket)).toBe(60);
  });
  it("takes off the part of the discount that falls on the services when the salon chooses 'after discount'", () => {
    expect(turnAmount(ticket, "service_after_discount")).toBe(45); // $20 off an $80 ticket: $15 of it is on the $60 of services
    expect(turnAmount({ serviceRevenue: "40.00", discountAmount: "50.00" }, "service_after_discount")).toBe(0);
  });
  it("a discount can move a ticket across a bracket", () => {
    const r = rules({ turnMode: "brackets", turnAmountBasis: "service_after_discount" });
    expect(turnUnits(r, turnAmount(ticket, r.amountBasis))).toBe(1000);
    expect(turnUnits(r, turnAmount(ticket))).toBe(2000);
  });
});

describe("the line", () => {
  const line = [1, 2, 3, 4]; // standing order: 1 has waited longest
  it("puts the lowest score first and keeps the standing order between equals", () => {
    expect(rankTurnLine({ line, scores: new Map([[1, 1000], [2, 500], [3, 500], [4, 2000]]) })).toEqual([2, 3, 1, 4]);
  });
  it("is the same answer every time for the same input", () => {
    const scores = new Map([[1, 1000], [2, 1000], [3, 1000], [4, 1000]]);
    expect(rankTurnLine({ line, scores })).toEqual(rankTurnLine({ line, scores }));
    expect(rankTurnLine({ line, scores })).toEqual([1, 2, 3, 4]);
  });
  it("settles ties by clock-in order when the salon asks for that, whatever the standing order", () => {
    const clockInOrder = new Map([[4, 0], [3, 1], [2, 2], [1, 3]]);
    const scores = new Map([[1, 500], [2, 500], [3, 500], [4, 1000]]);
    expect(rankTurnLine({ line, scores, tieBreak: "clock_in_order", clockInOrder })).toEqual([3, 2, 1, 4]);
    expect(rankTurnLine({ line, scores, tieBreak: "longest_waiting", clockInOrder })).toEqual([1, 2, 3, 4]);
  });
  it("fixed order: whoever took a turn longest ago is next, and those who have not had one go first", () => {
    // scores are "when they last took a turn": Amy 10:00, Lisa 10:05, Maria never, Jenny 10:10
    const scores = new Map([[1, 600], [2, 900], [4, 1200]]);
    expect(rankTurnLine({ line, scores })).toEqual([3, 1, 2, 4]);
  });
  it("fixed order cycles Amy → Lisa → Maria → Jenny → Amy when each takes a client in turn", () => {
    const scores = new Map<number, number>();
    const served: number[] = [];
    for (let clock = 1; clock <= 8; clock++) {
      const next = rankTurnLine({ line, scores })[0];
      served.push(next);
      scores.set(next, clock);
    }
    expect(served).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
  it("fixed order: a technician passed over keeps their place and is next again", () => {
    const scores = new Map<number, number>();
    const eligible = (id: number, round: number) => !(id === 1 && round === 1); // Amy is busy for the first client
    const served: number[] = [];
    for (let round = 1; round <= 5; round++) {
      const next = rankTurnLine({ line, scores }).find((id) => eligible(id, round))!;
      served.push(next);
      scores.set(next, round);
    }
    expect(served).toEqual([2, 1, 3, 4, 2]);
  });
  it("orders technicians by accumulated turns, using queue order to break ties", () => {
    expect(rankTurnLine({ line, scores: new Map([[1, 0], [2, 3000], [3, 2000], [4, 0]]) })).toEqual([1, 4, 3, 2]);
  });
});

describe("explaining an assignment", () => {
  const considered: ConsideredTechnician[] = [
    { id: 1, name: "Amy", position: 0, eligible: false, reasons: ["currently_busy"], units: 500 },
    { id: 2, name: "Lisa", position: 1, eligible: false, reasons: ["service_not_supported"], units: 500 },
    { id: 3, name: "Maria", position: 2, eligible: true, reasons: [], units: 1000 },
    { id: 4, name: "Jenny", position: 3, eligible: true, reasons: [], units: 1000 },
  ];
  it("names who got the client, why, and everyone passed over with the reason", () => {
    const text = explainAssignment({ rules: rules({ turnMode: "dollar" }), chosenId: 3, considered });
    expect(text).toContain("Maria had the fewest turns");
    expect(text).toContain("Amy (with a client)");
    expect(text).toContain("Lisa (doesn't perform this service)");
    expect(text).toContain("Level with Jenny; Maria had waited longest");
  });
  it("says the order was followed in fixed order, and names the category when rotations are per category", () => {
    const text = explainAssignment({ rules: rules({ turnMode: "round_robin" }), chosenId: 3, considered, category: "Pedicures" });
    expect(text).toContain("next technician in order for Pedicures who could take the client");
  });
  it("says so when staff chose, who was actually next, and the reason given", () => {
    const text = explainAssignment({ rules: rules({ turnMode: "dollar" }), chosenId: 4, considered, manual: true, overrideReason: "client is a relative" });
    expect(text).toBe("Jenny was chosen by staff (client is a relative). Amy was next in line.");
  });
  it("says nobody lost their place when the client asked for the technician", () => {
    expect(explainAssignment({ rules: rules({}), chosenId: 4, considered, manual: true, requested: true })).toContain("Nobody lost their place");
  });
});

describe("what a technician is told", () => {
  it("only says 'You're next' to the technician who would really get the client", () => {
    expect(lineMessage({ eligible: true, reasons: [], clockedIn: true }, 0)).toBe("You're next.");
    expect(lineMessage({ eligible: true, reasons: [], clockedIn: true }, 2)).toBe("2 technicians ahead of you.");
    expect(lineMessage({ eligible: true, reasons: [], clockedIn: true }, 1)).toBe("1 technician ahead of you.");
  });
  it("says why they are being passed over, and that their place is kept", () => {
    expect(lineMessage({ eligible: false, reasons: ["currently_busy"], clockedIn: true }, 0)).toBe("Passed over for now — with a client. Your place is kept.");
    expect(lineMessage({ eligible: false, reasons: ["not_clocked_in"], clockedIn: false }, 0)).toContain("clock in");
  });
});

describe("settings round-trip", () => {
  it("saves and reads back the same rules, and ignores anything it does not know", () => {
    const saved = turnRulesToSettings(rules({ turnMode: "brackets", turnBoundary: "over", turnTieBreak: "clock_in_order", turnSkipLosesTurn: ["paused", "nonsense"], turnResetPeriod: "day_close", turnLateJoin: "level", turnRefundPolicy: "remove", turnCategoryRotation: true }));
    expect(saved).toMatchObject({ turnMode: "brackets", turnBoundary: "over", turnTieBreak: "clock_in_order", turnSkipLosesTurn: ["paused"], turnResetPeriod: "day_close", turnLateJoin: "level", turnRefundPolicy: "remove", turnCategoryRotation: true });
    expect(turnRulesToSettings(normalizeTurnRules(saved))).toEqual(saved);
  });
  it("a salon that has never opened the new settings behaves exactly as before", () => {
    expect(normalizeTurnRules({ turnMode: "classic", turnValueThreshold: 30 })).toMatchObject({ mode: "classic", boundary: "at_or_over", amountBasis: "service", tieBreak: "longest_waiting", skipLosesTurn: [], resetPeriod: "business_day", lateJoin: "zero", refundPolicy: "keep", categoryRotation: false });
    expect(TURN_UNIT).toBe(1000);
  });
});
