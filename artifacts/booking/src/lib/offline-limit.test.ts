import { describe, it, expect } from "vitest";
import { OFFLINE_LIMIT_MS, offlineLimitReached } from "./offline-limit";

const HOUR = 60 * 60 * 1000;

describe("12-hour offline limit", () => {
  it("is twelve hours", () => {
    expect(OFFLINE_LIMIT_MS).toBe(12 * HOUR);
  });
  it("is not reached while the server answered within the last 12 hours", () => {
    expect(offlineLimitReached(0, 11 * HOUR + 59 * 60 * 1000)).toBe(false);
    expect(offlineLimitReached(0, 12 * HOUR)).toBe(false);
  });
  it("is reached once more than 12 hours have passed", () => {
    expect(offlineLimitReached(0, 12 * HOUR + 1)).toBe(true);
  });
  it("is cleared by a newer contact", () => {
    expect(offlineLimitReached(20 * HOUR, 21 * HOUR)).toBe(false);
  });
});
