import { describe, expect, it } from "vitest";
import { validateNailCheckoutInput, type NailCheckoutInput } from "../lib/nailCheckoutSettlement";

const sale = (): NailCheckoutInput => ({
  storeId: 1, appointmentId: 42, idempotencyKey: "nail-test-operation-42",
  tip: 0, discount: 0, totalPaid: 25, serviceRevenue: 25, productRevenue: 0,
  paymentMethod: "cash:25.00", tenders: [{ method: "cash", amount: 25 }],
});

describe("nail checkout input constraints", () => {
  it("accepts an ordinary cash sale", () => expect(() => validateNailCheckoutInput(sale())).not.toThrow());
  it("rejects missing card capture proof", () => expect(() => validateNailCheckoutInput({ ...sale(),
    tenders: [{ method: "tap", amount: 25 }] })).toThrow("Invalid tender"));
  it("rejects duplicate intent IDs", () => expect(() => validateNailCheckoutInput({ ...sale(), totalPaid: 50,
    tenders: [{ method: "tap", amount: 25, paymentIntentId: "pi_cardcharge123" },
      { method: "tap", amount: 25, paymentIntentId: "pi_cardcharge123" }] })).toThrow("Duplicate card charge"));
  it("accepts a card recorded from the salon's own terminal, with no charge behind it", () => {
    expect(() => validateNailCheckoutInput({ ...sale(), paymentMethod: "card:25.00", tenders: [{ method: "card", amount: 25 }] })).not.toThrow();
    // Like a gift card, it cannot be for more than the bill: only cash gives change.
    expect(() => validateNailCheckoutInput({ ...sale(), tenders: [{ method: "card", amount: 30 }] })).toThrow();
  });
  it("rejects missing payment", () => expect(() => validateNailCheckoutInput({ ...sale(), tenders: [] }))
    .toThrow("Payment amounts do not settle"));
  it("permits cash change but not gift/card overpayment", () => {
    expect(() => validateNailCheckoutInput({ ...sale(), tenders: [{ method: "cash", amount: 30 }] })).not.toThrow();
    expect(() => validateNailCheckoutInput({ ...sale(), tenders: [{ method: "gift", code: "TEST", amount: 30 }] }))
      .toThrow("Payment amounts do not settle");
  });
  it("rejects duplicate group members and mismatched group totals", () => {
    const share = { appointmentId: 42, tip: 0, discount: 0, totalPaid: 25, serviceRevenue: 25, productRevenue: 0, paymentMethod: "cash:25.00" };
    expect(() => validateNailCheckoutInput({ ...sale(), groupTickets: [share, share] })).toThrow("Group checkout shares");
    expect(() => validateNailCheckoutInput({ ...sale(), groupTickets: [{ ...share, totalPaid: 20 }] })).toThrow("Group checkout shares");
  });
});
