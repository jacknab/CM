import { describe, it, expect, vi, beforeEach } from "vitest";

// Stripe, as the salon's connected account would answer.
const pis = new Map<string, any>();
const captured: string[] = [];
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../lib/stripeConnect", () => ({
  getPaymentAccount: async () => ({ providerAccountId: "acct_salon", status: "active" }),
  retrieveTerminalPaymentIntent: async (_acct: string, id: string) => ({ ...pis.get(id) }),
  captureTerminalPaymentIntent: async (_acct: string, id: string) => { captured.push(id); const pi = { ...pis.get(id), status: "succeeded" }; pis.set(id, pi); return pi; },
}));
const { chargeCardTenders } = await import("../lib/nailCheckoutSettlement");

const sale = { storeId: 2, appointmentId: 361 };
const pi = (id: string, status: string, amount = 2500) =>
  pis.set(id, { id, status, amount, currency: "usd", metadata: { store_id: "2", appointment_id: "361", source: "nail_checkout" } });

beforeEach(() => { pis.clear(); captured.length = 0; });

describe("a ticket checkout's card payments", () => {
  it("are charged when the sale is saved (they were only authorized when the card was taken)", async () => {
    pi("pi_a", "requires_capture");
    await chargeCardTenders(sale, [{ method: "m2", amount: 25, paymentIntentId: "pi_a" }]);
    expect(captured).toEqual(["pi_a"]);
  });

  it("are not charged twice when the sale is saved again", async () => {
    pi("pi_a", "succeeded");
    await chargeCardTenders(sale, [{ method: "m2", amount: 25, paymentIntentId: "pi_a" }]);
    expect(captured).toEqual([]);
  });

  it("stop the sale when a card was voided or expired, rather than saving it unpaid", async () => {
    pi("pi_a", "canceled");
    await expect(chargeCardTenders(sale, [{ method: "m2", amount: 25, paymentIntentId: "pi_a" }])).rejects.toThrow(/voided or has expired/);
  });

  it("charge nothing when an amount or ticket doesn't match", async () => {
    pi("pi_a", "requires_capture", 3000);
    await expect(chargeCardTenders(sale, [{ method: "m2", amount: 25, paymentIntentId: "pi_a" }])).rejects.toThrow(/does not match/);
    expect(captured).toEqual([]);
  });

  it("charge every card of a split payment", async () => {
    pi("pi_a", "requires_capture", 1500); pi("pi_b", "requires_capture", 1000);
    await chargeCardTenders(sale, [{ method: "m2", amount: 15, paymentIntentId: "pi_a" }, { method: "tap", amount: 10, paymentIntentId: "pi_b" }]);
    expect(captured).toEqual(["pi_a", "pi_b"]);
  });
});
