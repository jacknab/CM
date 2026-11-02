import { describe, it, expect } from "vitest";
import { offlineSaleProblem } from "./offlineSale";

describe("what can be settled offline", () => {
  it("allows a plain cash sale, including split cash tenders", () => {
    expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 45 }] })).toBeNull();
    expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 20 }, { method: "cash", amount: 25 }] })).toBeNull();
  });
  it("refuses any card, reader or gift tender — a card is never reported paid without confirmation", () => {
    for (const method of ["m2", "tap_to_pay", "gift"]) {
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
  it("allows an M2 card the Certxa app took offline (it carries the app's reference)", () => {
    expect(offlineSaleProblem({ tenders: [{ method: "m2", amount: 45, offlineRef: "off_m1abc_k2j3h4" }] })).toBeNull();
    expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 10 }, { method: "m2", amount: 35, offlineRef: "off_m1abc_k2j3h4" }] })).toBeNull();
    expect(offlineSaleProblem({ tenders: [{ method: "tap", amount: 45, offlineRef: "off_m1abc_k2j3h4" }] })).toMatch(/Only cash/);
  });
  it("allows a card taken on the salon's own terminal (only recorded, nothing charged)", () => {
    expect(offlineSaleProblem({ tenders: [{ method: "card", amount: 45 }] })).toBeNull();
    expect(offlineSaleProblem({ tenders: [{ method: "cash", amount: 5 }, { method: "card", amount: 40 }] })).toBeNull();
  });
});
