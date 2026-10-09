import { describe, expect, it } from "vitest";
import { DAY_CLOSE_LOCK_MS, cashShortageCents, dayCloseLockedUntil, denominationTotal, parseDrawerAmount } from "./dayClose";

describe("Day Close shift boundaries", () => {
  const close = new Date("2026-09-27T22:00:00Z");

  it("blocks a second close for precisely 12 hours across new sessions", () => {
    const until = new Date(close.getTime() + DAY_CLOSE_LOCK_MS).toISOString();
    expect(dayCloseLockedUntil(close, new Date(close.getTime() + DAY_CLOSE_LOCK_MS - 1))).toBe(until);
    expect(dayCloseLockedUntil(close, new Date(close.getTime() + DAY_CLOSE_LOCK_MS))).toBeNull();
    expect(dayCloseLockedUntil(null, close)).toBeNull();
  });

  it("notifies only for cash shortages of at least two dollars", () => {
    expect(cashShortageCents(120, 118.01)).toBe(0);
    expect(cashShortageCents(120, 118)).toBe(200);
    expect(cashShortageCents(120, 116.75)).toBe(325);
    expect(cashShortageCents(120, 121)).toBe(0);
    expect(cashShortageCents(NaN, 0)).toBe(0);
  });
});

describe("drawer counts", () => {
  it("counts $2 bills and every coin", () => {
    expect(denominationTotal(JSON.stringify({ "20": 2, "2": 3, "0.25": 4, "0.01": 7 }))).toBe("47.07");
  });

  it("ignores unknown keys, negative and fractional counts, and unreadable input", () => {
    expect(denominationTotal(JSON.stringify({ "3": 5, "10": -2, "5": 1.5 }))).toBe("5.00");
    expect(denominationTotal("not json")).toBeNull();
    expect(denominationTotal(null)).toBeNull();
  });

  it("accepts only finite, non-negative typed amounts", () => {
    expect(parseDrawerAmount("118.5")).toBe("118.50");
    expect(parseDrawerAmount("-5")).toBeNull();
    expect(parseDrawerAmount("abc")).toBeNull();
    expect(parseDrawerAmount("")).toBeNull();
  });
});
