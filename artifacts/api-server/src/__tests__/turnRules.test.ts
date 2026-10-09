import { describe, expect, it } from "vitest";
import { normalizeTurnRules, orderTurnLine, turnAmount, turnValue, type TurnRules } from "../lib/turnRules";

const DOLLAR: TurnRules = { mode: "dollar", dollarsPerTurn: 30, partialTurnValue: 0.5 };
const CLASSIC: TurnRules = { mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 };

describe("turnValue — Dollar-Based Turns ($30 a turn)", () => {
  it("gives half a turn under $30", () => {
    expect(turnValue(DOLLAR, 20)).toBe(0.5);
    expect(turnValue(DOLLAR, 25)).toBe(0.5);
    expect(turnValue(DOLLAR, 29.99)).toBe(0.5);
  });
  it("gives one turn from $30 up to just under $60", () => {
    expect(turnValue(DOLLAR, 30)).toBe(1);
    expect(turnValue(DOLLAR, 40)).toBe(1);
    expect(turnValue(DOLLAR, 45)).toBe(1);
    expect(turnValue(DOLLAR, 59.99)).toBe(1);
  });
  it("gives one turn per full $30 above that", () => {
    expect(turnValue(DOLLAR, 60)).toBe(2);
    expect(turnValue(DOLLAR, 65)).toBe(2);
    expect(turnValue(DOLLAR, 90)).toBe(3);
  });
  it("gives nothing for an unpaid ticket", () => {
    expect(turnValue(DOLLAR, 0)).toBe(0);
    expect(turnValue(DOLLAR, -5)).toBe(0);
    expect(turnValue(DOLLAR, NaN)).toBe(0);
  });
  it("follows the salon's own dollars-per-turn and partial value", () => {
    const salon: TurnRules = { mode: "dollar", dollarsPerTurn: 40, partialTurnValue: 0.25 };
    expect(turnValue(salon, 35)).toBe(0.25);
    expect(turnValue(salon, 40)).toBe(1);
    expect(turnValue(salon, 85)).toBe(2);
  });
});

describe("turnValue — Counted Turns", () => {
  it("counts one turn at or over the threshold and none under it", () => {
    expect(turnValue(CLASSIC, 29.99)).toBe(0);
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
  it("holds every short-turn technician at the front, in the order they earned it", () => {
    const totals = new Map([[1, 0], [2, 3], [3, 2]]);
    expect(orderTurnLine([1, 2, 3], totals, [3, 2])).toEqual([3, 2, 1]);
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
    expect([totals.get(AMY), totals.get(LISA), totals.get(MARIA), totals.get(JENNY)]).toEqual([0.5, 1, 0.5, 2]);
  });
  it("then sends the next client to a technician on the lowest total, never to Jenny who just finished", () => {
    const { served } = run([20, 45, 25, 65, 40]);
    // Amy and Maria are level on ½; Amy has waited longer, so she is due first.
    expect(served[4]).toBe(AMY);
    expect(served[4]).not.toBe(JENNY);
  });
  it("ends with everyone balanced by turns, not by number of clients", () => {
    const { totals, due } = run([20, 45, 25, 65, 40]);
    expect(totals.get(AMY)).toBe(1.5);
    expect(due).toBe(MARIA); // the only technician still on ½
  });
});

describe("normalizeTurnRules", () => {
  it("defaults to counted turns at $30 with a half partial", () => {
    expect(normalizeTurnRules({})).toEqual({ mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 });
    expect(normalizeTurnRules(null)).toEqual({ mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 });
  });
  it("reads a salon's saved rules and rejects nonsense", () => {
    expect(normalizeTurnRules({ turnMode: "dollar", turnValueThreshold: "45", partialTurnValue: 0.25 })).toEqual({ mode: "dollar", dollarsPerTurn: 45, partialTurnValue: 0.25 });
    expect(normalizeTurnRules({ turnMode: "other", turnValueThreshold: -3, partialTurnValue: 7 })).toEqual({ mode: "classic", dollarsPerTurn: 30, partialTurnValue: 0.5 });
  });
});
