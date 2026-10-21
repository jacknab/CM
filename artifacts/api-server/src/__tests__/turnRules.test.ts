import { describe, expect, it } from "vitest";
import { normalizeTurnRules, orderTurnLine, turnAmount, turnValue, type TurnRules } from "../lib/turnRules";

const DOLLAR: TurnRules = { mode: "dollar", dollarsPerTurn: 30, partialTurnValue: 0.5 };
const CLASSIC: TurnRules = { mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 };

describe("turnValue — Dollar-Based Turns ($30 a turn)", () => {
  // The owner's rule (2026-10-17): up to $30 is ½; over it, one turn per full $30 plus ½ for anything left over.
  it("matches the owner's examples", () => {
    const owner: [number, number][] = [[20, 0.5], [30, 0.5], [45, 1.5], [60, 2], [75, 2.5], [88.5, 2.5], [90, 3]];
    for (const [amount, turns] of owner) expect(turnValue(DOLLAR, amount)).toBe(turns);
  });
  it("gives half a turn up to and including $30", () => {
    expect(turnValue(DOLLAR, 0.01)).toBe(0.5);
    expect(turnValue(DOLLAR, 29.99)).toBe(0.5);
    expect(turnValue(DOLLAR, 30)).toBe(0.5);
  });
  it("adds the half turn the moment an amount goes past a full turn", () => {
    expect(turnValue(DOLLAR, 30.01)).toBe(1.5);
    expect(turnValue(DOLLAR, 59.99)).toBe(1.5);
    expect(turnValue(DOLLAR, 60.01)).toBe(2.5);
    expect(turnValue(DOLLAR, 89.99)).toBe(2.5);
  });
  it("only ever gives whole and half turns", () => {
    for (let cents = 1; cents <= 30_000; cents += 7) expect((turnValue(DOLLAR, cents / 100) * 2) % 1).toBe(0);
  });
  it("gives nothing for an unpaid ticket", () => {
    expect(turnValue(DOLLAR, 0)).toBe(0);
    expect(turnValue(DOLLAR, -5)).toBe(0);
    expect(turnValue(DOLLAR, NaN)).toBe(0);
  });
  it("follows the salon's own dollars-per-turn and partial value", () => {
    const salon: TurnRules = { mode: "dollar", dollarsPerTurn: 40, partialTurnValue: 0.25 };
    expect(turnValue(salon, 35)).toBe(0.25);
    expect(turnValue(salon, 40)).toBe(0.25);
    expect(turnValue(salon, 80)).toBe(2);
    expect(turnValue(salon, 85)).toBe(2.25);
  });
  it("gives 1/2 turn when a positive paid ticket would otherwise earn zero", () => {
    const noPartial: TurnRules = { mode: "dollar", dollarsPerTurn: 30, partialTurnValue: 0 };
    expect(turnValue(noPartial, 20)).toBe(0.5);
  });
});

describe("turnValue — Counted Turns", () => {
  it("counts half a turn below the threshold and a full turn at or over it", () => {
    expect(turnValue(CLASSIC, 0.01)).toBe(0.5);
    expect(turnValue(CLASSIC, 15)).toBe(0.5);
    expect(turnValue(CLASSIC, 29.99)).toBe(0.5);
    expect(turnValue(CLASSIC, 30)).toBe(1);
    expect(turnValue(CLASSIC, 200)).toBe(1);
    expect(turnValue(CLASSIC, 0)).toBe(0);
  });
});

describe("turnAmount — only the service earns a turn", () => {
  it("uses the frozen service revenue, ignoring retail, tax and tip", () => {
    expect(turnAmount({ serviceRevenue: "25.00", productRevenue: "30.00", totalPaid: "64.40", tipAmount: "5.00" })).toBe(25);
  });
  it("falls back to total less tip and retail on older tickets", () => {
    expect(turnAmount({ totalPaid: "60", tipAmount: "10", productRevenue: "15" })).toBe(35);
    expect(turnAmount({ totalPaid: "20", tipAmount: "5" })).toBe(15);
  });
  it("is never negative, and zero for an unpaid ticket", () => {
    expect(turnAmount({ totalPaid: "5", tipAmount: "10" })).toBe(0);
    expect(turnAmount({})).toBe(0);
  });
});

describe("orderTurnLine", () => {
  it("puts the lowest turn total first and keeps first-come order among equals", () => {
    const totals = new Map([[1, 1], [2, 0.5], [3, 0.5], [4, 2]]);
    expect(orderTurnLine([1, 2, 3, 4], totals)).toEqual([2, 3, 1, 4]);
    expect(orderTurnLine([4, 3, 2, 1], totals)).toEqual([3, 2, 1, 4]);
  });
  it("orders technicians by total turns, with queue order breaking ties", () => {
    const totals = new Map([[1, 0], [2, 3], [3, 2]]);
    expect(orderTurnLine([1, 2, 3], totals)).toEqual([1, 3, 2]);
  });
  it("does not change the line it was given", () => {
    const line = [3, 1, 2];
    orderTurnLine(line, new Map([[1, 0]]));
    expect(line).toEqual([3, 1, 2]);
  });
});

describe("the salon's worked example: Amy, Lisa, Maria, Jenny at $30 a turn", () => {
  // Whoever is first in the line takes the client; when the ticket is paid they earn its turns and
  // go to the back of the standing order. The line is then re-read by turn total.
  const AMY = 1, LISA = 2, MARIA = 3, JENNY = 4;
  const run = (tickets: number[]) => {
    let standing = [AMY, LISA, MARIA, JENNY];
    const totals = new Map<number, number>();
    const served: number[] = [];
    for (const amount of tickets) {
      const next = orderTurnLine(standing, totals)[0];
      served.push(next);
      totals.set(next, (totals.get(next) ?? 0) + turnValue(DOLLAR, amount));
      standing = [...standing.filter((id) => id !== next), next];
    }
    return { served, totals, due: orderTurnLine(standing, totals)[0] };
  };

  it("rotates Amy → Lisa → Maria → Jenny on the first four tickets with the totals from the example", () => {
    const { served, totals } = run([20, 45, 25, 65]);
    expect(served).toEqual([AMY, LISA, MARIA, JENNY]);
    expect([totals.get(AMY), totals.get(LISA), totals.get(MARIA), totals.get(JENNY)]).toEqual([0.5, 1.5, 0.5, 2.5]);
  });
  it("then sends the next client to a technician on the lowest total, never to Jenny who just finished", () => {
    const { served } = run([20, 45, 25, 65, 40]);
    // Amy and Maria are level on 1/2; Amy has waited longer, so she is due first.
    expect(served[4]).toBe(AMY);
    expect(served[4]).not.toBe(JENNY);
  });
  it("ends with everyone balanced by turns, not by number of clients", () => {
    const { totals, due } = run([20, 45, 25, 65, 40]);
    expect(totals.get(AMY)).toBe(2);
    expect(due).toBe(MARIA); // the only technician still on 1/2
  });
});

describe("normalizeTurnRules", () => {
  it("defaults to counted turns at $30 with a half partial", () => {
    expect(normalizeTurnRules({})).toMatchObject({ mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 });
    expect(normalizeTurnRules(null)).toMatchObject({ mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 });
  });
  it("reads a salon's saved rules and rejects nonsense", () => {
    expect(normalizeTurnRules({ turnMode: "dollar", turnValueThreshold: "45", partialTurnValue: 0.25 })).toMatchObject({ mode: "dollar", dollarsPerTurn: 45, partialTurnValue: 0.25 });
    expect(normalizeTurnRules({ turnMode: "other", turnValueThreshold: -3, partialTurnValue: 7 })).toMatchObject({ mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 });
  });
});
