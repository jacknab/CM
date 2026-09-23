import { describe, expect, it } from "vitest";
import { giftAmountCents, giftCardProblem, normalizeGiftCode } from "../lib/nailGiftCards";
import { paymentMethodSummary } from "@shared/nailCheckout";

describe("gift card helpers", () => {
  it("normalizes a typed or scanned code", () => {
    expect(normalizeGiftCode("  gc-ab12 cd34 ")).toBe("GC-AB12CD34");
    expect(normalizeGiftCode(null)).toBe("");
  });
  it("only accepts a positive, finite amount, in whole cents", () => {
    expect(giftAmountCents(20)).toBe(2000);
    expect(giftAmountCents("12.345")).toBe(1235);
    for (const bad of [0, -5, "abc", NaN, Infinity, undefined, null, ""]) expect(giftAmountCents(bad)).toBeNull();
  });
  it("explains why a card can't be spent", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    expect(giftCardProblem({ isActive: true, balance: 25, expiresAt: null }, now)).toBeNull();
    expect(giftCardProblem({ isActive: true, balance: 25, expiresAt: "2026-12-31T00:00:00Z" }, now)).toBeNull();
    expect(giftCardProblem({ isActive: true, balance: 25, expiresAt: "2026-09-01T00:00:00Z" }, now)).toMatch(/expired/);
    expect(giftCardProblem({ isActive: false, balance: 25, expiresAt: null }, now)).toMatch(/no balance/);
    expect(giftCardProblem({ isActive: true, balance: 0, expiresAt: null }, now)).toMatch(/no balance/);
  });
  it("records a gift tender in the calendar's method:amount format", () => {
    expect(paymentMethodSummary([{ id: 1, method: "gift", amount: 30, code: "GC-AAAA1111" }, { id: 2, method: "tap", amount: 10 }])).toBe("gift:30.00,tap:10.00");
  });
});
