import { describe, expect, it } from "vitest";
import { awardDelta, pointsToAward } from "../lib/loyaltyAward";

describe("pointsToAward", () => {
  it("earns the store's rate on what was spent, in whole points", () => {
    expect(pointsToAward(55, 0, 10)).toBe(550);
    expect(pointsToAward(81, 0, 10)).toBe(810);
    expect(pointsToAward(19.99, 0, 1)).toBe(20);
  });
  it("a tip is not spend — it earns nothing", () => {
    expect(pointsToAward(1.15, 0.15, 10)).toBe(10);
    expect(pointsToAward(100, 20, 10)).toBe(800);
    expect(pointsToAward(10, 15, 10)).toBe(0); // tip larger than the payment can't go negative
  });
  it("falls back to 1 point per dollar when the rate is missing or bad", () => {
    expect(pointsToAward(40, 0, 0)).toBe(40);
    expect(pointsToAward(40, 0, NaN)).toBe(40);
  });
});

describe("awardDelta", () => {
  it("books only the difference, so completing a ticket twice can't award twice", () => {
    expect(awardDelta(550, 0)).toBe(550);     // first completion
    expect(awardDelta(550, 550)).toBe(0);     // reopened and completed again, same amount
    expect(awardDelta(550, 1100)).toBe(-550); // it was already double-awarded: take the extra back
  });
  it("follows a corrected payment amount up or down", () => {
    expect(awardDelta(800, 550)).toBe(250);
    expect(awardDelta(300, 550)).toBe(-250);
  });
});
