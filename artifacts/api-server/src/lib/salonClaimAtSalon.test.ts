import { describe, expect, it } from "vitest";
import { metersBetween } from "./salonClaim";

describe("metersBetween", () => {
  it("is zero at the same spot and about right across a street and across town", () => {
    const salon = { latitude: 33.6789608, longitude: -117.9062716 };
    expect(metersBetween(salon, salon)).toBe(0);
    expect(metersBetween(salon, { latitude: 33.6798608, longitude: -117.9062716 })).toBeCloseTo(100, -1); // 0.0009° north ≈ 100 m
    expect(metersBetween(salon, { latitude: 33.7489608, longitude: -117.9062716 })).toBeGreaterThan(7700); // ≈ 7.8 km
  });
});
