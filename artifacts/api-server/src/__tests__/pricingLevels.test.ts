import { describe, expect, it } from "vitest";
import { pickPrice, priceRanges, usesPricingLevels } from "../lib/pricingLevels";

describe("pricing levels — the price rule (barbershops and hair salons)", () => {
  const base = { standard: "35.00", override: null, levelPrice: null, levelId: null, levelName: null };
  it("a professional's own price wins over their level's", () => {
    expect(pickPrice(1, { ...base, override: "48.00", levelPrice: "45.00", levelId: 3, levelName: "Master" }))
      .toEqual({ serviceId: 1, price: 48, source: "override", levelId: 3, levelName: "Master", missing: false });
  });
  it("then their level's price", () => {
    expect(pickPrice(1, { ...base, levelPrice: "45.00", levelId: 3, levelName: "Master" })).toMatchObject({ price: 45, source: "level", missing: false });
  });
  it("on a level with no price for the service: the standard price, flagged as missing for the owner", () => {
    expect(pickPrice(1, { ...base, levelId: 3, levelName: "Master" })).toMatchObject({ price: 35, source: "standard", missing: true, levelName: "Master" });
  });
  it("no level at all (every nail salon): the standard price, nothing missing", () => {
    expect(pickPrice(1, base)).toEqual({ serviceId: 1, price: 35, source: "standard", levelId: null, levelName: null, missing: false });
  });
  it("a $0 price is a price, not a blank", () => {
    expect(pickPrice(1, { ...base, override: "0.00" })).toMatchObject({ price: 0, source: "override" });
  });
});

describe("price ranges", () => {
  it("one price when everyone charges the same, a range when they differ", () => {
    const r = priceRanges([{ serviceId: 1, price: 35 }, { serviceId: 1, price: 50 }, { serviceId: 1, price: 40 }, { serviceId: 2, price: 15 }, { serviceId: 2, price: 15 }]);
    expect(r.get(1)).toEqual({ min: 35, max: 50 });
    expect(r.get(2)).toEqual({ min: 15, max: 15 });
  });
});

describe("which businesses price by professional", () => {
  it("barbershops and hair salons only — never a nail salon", () => {
    expect(usesPricingLevels("Barbershop")).toBe(true);
    expect(usesPricingLevels("Hair Salon")).toBe(true);
    expect(usesPricingLevels("Nail Salon")).toBe(false);
    expect(usesPricingLevels(null)).toBe(false);
  });
});
