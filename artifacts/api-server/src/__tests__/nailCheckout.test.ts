import { describe, expect, test } from "vitest";
import { centsToDollars, computeCheckout, paymentMethodSummary, pushKeypadDigits, splitGroup, type CheckoutInput } from "@shared/nailCheckout";

const base: CheckoutInput = { ticketTotal: 100, extras: [], linkedSubtotal: 0, discount: null, rewardDollar: 0, tip: 0, tenders: [] };

describe("computeCheckout", () => {
  test("plain ticket: total = ticket, nothing paid, not settled", () => {
    const t = computeCheckout(base);
    expect(t).toMatchObject({ subtotal: 100, discount: 0, total: 100, balanceDue: 100, changeDue: 0, settled: false, serviceRevenue: 100, productRevenue: 0 });
  });
  test("extras add to the subtotal; only retail counts as product revenue", () => {
    const t = computeCheckout({ ...base, extras: [{ id: 1, label: "Retail Item", price: 12.5, kind: "retail" }, { id: 2, label: "+Extra", price: 5, kind: "custom" }] });
    expect(t.subtotal).toBe(117.5);
    expect(t.productRevenue).toBe(12.5);
    expect(t.serviceRevenue).toBe(105);
  });
  test("percent discount, dollar discount, and a redeemed reward stack but never exceed the subtotal", () => {
    expect(computeCheckout({ ...base, discount: { type: "percent", value: 10 } }).discount).toBe(10);
    expect(computeCheckout({ ...base, discount: { type: "dollar", value: 15 }, rewardDollar: 5 }).discount).toBe(20);
    const comp = computeCheckout({ ...base, discount: { type: "percent", value: 100 } });
    expect(comp).toMatchObject({ discount: 100, total: 0, settled: true });
    expect(computeCheckout({ ...base, discount: { type: "dollar", value: 500 } }).total).toBe(0);
    expect(computeCheckout({ ...base, discount: { type: "percent", value: 250 } }).discount).toBe(100);
  });
  test("tip is added after the discount", () => {
    const t = computeCheckout({ ...base, discount: { type: "percent", value: 20 }, tip: 16 });
    expect(t.total).toBe(96);
  });
  test("cash over-payment: change is given back and totalPaid is the sale, not the cash handed over", () => {
    const t = computeCheckout({ ...base, tenders: [{ id: 1, method: "cash", amount: 120 }] });
    expect(t).toMatchObject({ balanceDue: 0, changeDue: 20, totalPaid: 100, settled: true });
  });
  test("split payment: partial payments leave a balance until covered", () => {
    const part = computeCheckout({ ...base, tenders: [{ id: 1, method: "cash", amount: 40 }] });
    expect(part).toMatchObject({ balanceDue: 60, settled: false, totalPaid: 40 });
    const full = computeCheckout({ ...base, tenders: [{ id: 1, method: "cash", amount: 40 }, { id: 2, method: "card", amount: 60 }] });
    expect(full).toMatchObject({ balanceDue: 0, changeDue: 0, settled: true, totalPaid: 100 });
  });
  test("a $0 ticket (comp) is settled with no payment", () => {
    expect(computeCheckout({ ...base, ticketTotal: 0 }).settled).toBe(true);
  });
  test("rounds to the cent", () => {
    const t = computeCheckout({ ...base, ticketTotal: 33.33, discount: { type: "percent", value: 15 } });
    expect(t.discount).toBe(5);
    expect(t.total).toBe(28.33);
  });
});

describe("splitGroup", () => {
  test("shares add back up exactly (last ticket takes the rounding)", () => {
    const shares = splitGroup(
      [{ appointmentId: 1, base: 60, duration: 60, serviceRevenue: 60, productRevenue: 0 }, { appointmentId: 2, base: 30, duration: 30, serviceRevenue: 30, productRevenue: 0 }, { appointmentId: 3, base: 10, duration: 10, serviceRevenue: 10, productRevenue: 0 }],
      { tip: 10.01, discount: 7.77, totalPaid: 92.24 }, "cash:92.24");
    const sum = (k: "tip" | "discount" | "totalPaid") => Math.round(shares.reduce((s, x) => s + x[k], 0) * 100) / 100;
    expect(sum("tip")).toBe(10.01); expect(sum("discount")).toBe(7.77); expect(sum("totalPaid")).toBe(92.24);
    expect(shares[0].totalPaid).toBeGreaterThan(shares[1].totalPaid);
    expect(shares.every((s) => s.paymentMethod === "cash:92.24")).toBe(true);
  });
});

describe("keypad + summary helpers", () => {
  test("cents keypad: 1 2 5 0 → $12.50, leading zeros dropped, capped length", () => {
    let k = ""; for (const d of "1250") k = pushKeypadDigits(k, d);
    expect(centsToDollars(k)).toBe(12.5);
    expect(pushKeypadDigits("", "00")).toBe("");
    expect(pushKeypadDigits("5", "00")).toBe("500");
    expect(pushKeypadDigits("12345678", "9")).toBe("12345678");
  });
  test("payment method summary matches the calendar's format", () => {
    expect(paymentMethodSummary([{ id: 1, method: "cash", amount: 20 }, { id: 2, method: "card", amount: 15.5 }])).toBe("cash:20.00,card:15.50");
  });
});
