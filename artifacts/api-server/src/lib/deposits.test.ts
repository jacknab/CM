import { describe, expect, it, vi } from "vitest";
import { depositFromRule, depositIsSet, splitDeposit } from "./bookingPaymentLinks";

describe("what a deposit comes to", () => {
  it("takes the whole visit, a fixed amount or a percent", () => {
    expect(depositFromRule({ type: "full", value: null }, 9500)).toBe(9500);
    expect(depositFromRule({ type: "fixed", value: "25" }, 9500)).toBe(2500);
    expect(depositFromRule({ type: "percentage", value: "20" }, 9500)).toBe(1900);
  });

  it("counts the travel fee only when the business says so", () => {
    expect(depositFromRule({ type: "full", value: null }, 5000, 1500)).toBe(5000);
    expect(depositFromRule({ type: "full", value: null, includeTravelFee: true }, 5000, 1500)).toBe(6500);
    expect(depositFromRule({ type: "percentage", value: "50", includeTravelFee: true }, 5000, 1500)).toBe(3250);
  });

  it("is never more than the visit, and nothing for a free visit", () => {
    expect(depositFromRule({ type: "fixed", value: "50" }, 3000)).toBe(3000);
    expect(depositFromRule({ type: "fixed", value: "50" }, 0)).toBe(0);
  });

  it("meets Stripe's minimum", () => {
    expect(depositFromRule({ type: "percentage", value: "1" }, 1000)).toBe(50);
  });

  it("needs an amount unless it's the whole price", () => {
    expect(depositIsSet({ type: "full", value: null })).toBe(true);
    expect(depositIsSet({ type: "fixed", value: null })).toBe(false);
    expect(depositFromRule({ type: "fixed", value: null }, 5000)).toBe(0);
  });
});

describe("a deposit across a two-service visit", () => {
  const parts = [{ id: 1, cents: 4000 }, { id: 2, cents: 5500 }];
  it("comes off both when it's larger than the first", () => {
    expect(splitDeposit(9500, parts)).toEqual([{ id: 1, cents: 4000 }, { id: 2, cents: 5500 }]);
  });
  it("stays on the first when it fits", () => {
    expect(splitDeposit(2500, parts)).toEqual([{ id: 1, cents: 2500 }, { id: 2, cents: 0 }]);
  });
  it("loses nothing: every cent lands on an appointment", () => {
    expect(splitDeposit(9600, parts).reduce((sum, x) => sum + x.cents, 0)).toBe(9600);
  });
});

describe("the house-call alarm's words", () => {
  it("says who, what, when and where", async () => {
    const { alarmText } = await import("../services/house-call-alarm");
    expect(alarmText({ client: "Linda Parker", service: "Gel Manicure", time: "2:00 PM", address: { line1: "12 Elm St", city: "Denver" } }))
      .toEqual({ title: "Time to get ready for your house call", body: "Linda Parker · Gel Manicure at 2:00 PM\n12 Elm St, Denver" });
    expect(alarmText({ client: null, service: null, time: "2:00 PM" }).body).toBe("Your client at 2:00 PM");
  });
});

describe("the $1 card check", () => {
  const card = { storeId: 41, customerId: "cus_1", paymentMethodId: "pm_1" };
  const stripe = (create: () => Promise<any>) => {
    const cancel = vi.fn(async () => ({}));
    return { paymentIntents: { create: vi.fn(create), cancel }, cancel } as any;
  };

  it("holds $1 and releases it straight away, capturing nothing", async () => {
    const { checkCardWithHold } = await import("../routes/bookingPayments");
    const s = stripe(async () => ({ id: "pi_1", status: "requires_capture" }));
    await checkCardWithHold(s, "acct_1", card);
    expect(s.paymentIntents.create.mock.calls[0][0]).toMatchObject({ amount: 100, capture_method: "manual", confirm: true, off_session: true });
    expect(s.cancel).toHaveBeenCalledWith("pi_1", {}, { stripeAccount: "acct_1" });
  });

  it("stops on a declined card, with the bank's message", async () => {
    const { checkCardWithHold } = await import("../routes/bookingPayments");
    const s = stripe(async () => { throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined" }); });
    await expect(checkCardWithHold(s, "acct_1", card)).rejects.toThrow("Your card was declined.");
  });

  it("doesn't turn a client away when the bank wants them present, or Stripe has a problem", async () => {
    const { checkCardWithHold } = await import("../routes/bookingPayments");
    await expect(checkCardWithHold(stripe(async () => { throw Object.assign(new Error("x"), { type: "StripeCardError", code: "authentication_required" }); }), "acct_1", card)).resolves.toBeUndefined();
    await expect(checkCardWithHold(stripe(async () => { throw Object.assign(new Error("x"), { type: "StripeConnectionError" }); }), "acct_1", card)).resolves.toBeUndefined();
  });
});
