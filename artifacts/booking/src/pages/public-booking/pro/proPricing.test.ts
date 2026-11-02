import { describe, expect, it } from "vitest";
import { anyRange, money, priceRange, prosForAll, proTotal } from "./proPricing";

// John Standard, Michael Senior, David Master, James Platinum (the brief's example); James has his own $48 haircut.
const HAIRCUT = 1, BEARD = 2, SHAVE = 3;
const staff = [{ id: 10, name: "John" }, { id: 11, name: "Michael" }, { id: 12, name: "David" }, { id: 13, name: "James" }];
const prices = [
  { staffId: 10, serviceId: HAIRCUT, price: 35 }, { staffId: 11, serviceId: HAIRCUT, price: 40 }, { staffId: 12, serviceId: HAIRCUT, price: 45 }, { staffId: 13, serviceId: HAIRCUT, price: 48 },
  { staffId: 10, serviceId: BEARD, price: 15 }, { staffId: 11, serviceId: BEARD, price: 18 }, { staffId: 12, serviceId: BEARD, price: 20 }, { staffId: 13, serviceId: BEARD, price: 25 },
  { staffId: 10, serviceId: SHAVE, price: 30 }, { staffId: 11, serviceId: SHAVE, price: 30 }, // only two shave, same price
];

describe("barbershop / hair salon booking — prices", () => {
  it("shows a range before a professional is chosen, a single price when everyone charges the same", () => {
    expect(priceRange(35, 48)).toBe("$35–$48");
    expect(priceRange(30, 30)).toBe("$30");
    expect(money(20.5)).toBe("$20.50");
  });
  it("a chosen professional's prices (their own price included)", () => {
    expect(proTotal(prices, 13, [HAIRCUT])).toBe(48);
    expect(proTotal(prices, 11, [HAIRCUT, BEARD])).toBe(58);
  });
  it("only professionals who do every chosen service can be picked", () => {
    expect(prosForAll(staff, prices, [SHAVE]).map((s) => s.name)).toEqual(["John", "Michael"]);
    expect(prosForAll(staff, prices, [HAIRCUT, SHAVE]).map((s) => s.name)).toEqual(["John", "Michael"]);
  });
  it("Any available shows the range over those who can do it all", () => {
    expect(anyRange([10, 11, 12, 13], prices, [HAIRCUT, BEARD])).toEqual({ min: 50, max: 73 });
    expect(anyRange([], prices, [HAIRCUT])).toBeNull();
  });
});
