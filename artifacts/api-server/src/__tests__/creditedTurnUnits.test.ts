import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ pool: {}, db: {} }));
vi.mock("../lib/nailTickets", () => ({ walkInSQL: () => "TRUE" }));

import { creditedUnitsForScore } from "../lib/turnEngine";
import { TURN_UNIT, normalizeTurnRules } from "@shared/turnRules";

describe("credited turn score recovery", () => {
  it("restores a half turn for a positive classic ticket whose saved credit is zero", () => {
    const rules = normalizeTurnRules({ turnMode: "classic", turnValueThreshold: 30 });
    expect(creditedUnitsForScore(0, 18, rules)).toBe(TURN_UNIT / 2);
  });

  it("uses the configured method when it yields a non-zero score", () => {
    const rules = normalizeTurnRules({ turnMode: "classic", turnValueThreshold: 30 });
    expect(creditedUnitsForScore(0, 35, rules)).toBe(TURN_UNIT);
  });

  it("preserves zero for unpaid tickets and deliberate duplicate client credits", () => {
    const classic = normalizeTurnRules({ turnMode: "classic" });
    const clients = normalizeTurnRules({ turnMode: "client_count" });
    expect(creditedUnitsForScore(0, 0, classic)).toBe(0);
    expect(creditedUnitsForScore(0, 18, clients)).toBe(0);
  });

  it("does not recalculate a non-zero recorded credit", () => {
    const rules = normalizeTurnRules({ turnMode: "classic" });
    expect(creditedUnitsForScore(2 * TURN_UNIT, 18, rules)).toBe(2 * TURN_UNIT);
  });
});
