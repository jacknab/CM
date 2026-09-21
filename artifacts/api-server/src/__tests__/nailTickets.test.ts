import { describe, expect, it } from "vitest";
import { priceTicket, sanitizeCustomLines } from "../lib/nailTickets";

describe("sanitizeCustomLines", () => {
  it("keeps valid lines, trims labels, rounds to the cent", () => {
    expect(sanitizeCustomLines([{ label: "  Repair  ", price: 12.345 }, { price: 5 }])).toEqual([
      { label: "Repair", price: 12.35 },
      { label: "Custom Amount", price: 5 },
    ]);
  });
  it("drops junk, zero/negative and absurd amounts", () => {
    expect(sanitizeCustomLines([{ label: "x", price: 0 }, { label: "x", price: -3 }, { label: "x", price: "abc" }, { label: "x", price: 10000 }, null])).toEqual([]);
    expect(sanitizeCustomLines("nope")).toEqual([]);
    expect(sanitizeCustomLines(undefined)).toEqual([]);
  });
  it("caps at 20 lines", () => {
    expect(sanitizeCustomLines(Array.from({ length: 30 }, () => ({ label: "a", price: 1 })))).toHaveLength(20);
  });
});

describe("priceTicket with custom amounts", () => {
  it("adds custom money to the price but no time", () => {
    const base = priceTicket({ serviceDuration: 45, servicePrice: 40, addons: [{ duration: 10, price: 5 }] });
    const withCustom = priceTicket({ serviceDuration: 45, servicePrice: 40, addons: [{ duration: 10, price: 5 }], customPrice: 12.5 });
    expect(withCustom.duration).toBe(base.duration);
    expect(withCustom.price).toBeCloseTo(base.price + 12.5, 2);
  });
});
