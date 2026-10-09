import { describe, it, expect } from "vitest";
import { offlineSaleProblem } from "./offlineSale";

describe("what can be settled offline", () => {
  it("allows a plain cash sale, including split cash tenders", () => {
    expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 45 }] })).toBeNull();
    expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 20 }, { method: "cash", amount: 25 }] })).toBeNull();
  });
  it("refuses any card, reader or gift tender — a card is never reported paid without confirmation", () => {
    for (const method of ["m2", "tap_to_pay", "card", "gift"]) {
      expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 10 }, { method, amount: 35 }] })).toMatch(/Only cash/);
    }
    expect(offlineSaleProblem({ tenders: [] })).toMatch(/Only cash/);
  });
  it("refuses gift cards, reward redemption and group pay", () => {
    const cash = [{ method: "cash", amount: 45 }];
    expect(offlineSaleProblem({ tenders: cash, giftCards: [{ code: "GC-1", amount: 5 }] })).toMatch(/Gift cards/);
    expect(offlineSaleProblem({ tenders: cash, redemption: { rewardId: 1 } })).toMatch(/Rewards/);
    expect(offlineSaleProblem({ tenders: cash, groupTickets: [{ appointmentId: 2 }] })).toMatch(/Group Pay/);
  });
});
