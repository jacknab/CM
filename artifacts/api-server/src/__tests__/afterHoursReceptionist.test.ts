import { describe, expect, it } from "vitest";
import { buildAfterHoursGreeting, isSalonAfterHours } from "../lib/afterHoursReceptionist";

const weekdayHours = [
  { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 6, openTime: "09:00", closeTime: "17:00", isClosed: true },
  { dayOfWeek: 0, openTime: "09:00", closeTime: "17:00", isClosed: true },
];

describe("after-hours receptionist context", () => {
  it("uses the salon timezone rather than UTC", () => {
    const instant = new Date("2026-09-28T00:30:00.000Z"); // Sunday 5:30 PM in Los Angeles
    expect(isSalonAfterHours(weekdayHours, "America/Los_Angeles", instant)).toBe(true);
  });

  it("recognizes a salon-local open time", () => {
    const instant = new Date("2026-09-28T17:00:00.000Z"); // Monday 10:00 AM in Los Angeles
    expect(isSalonAfterHours(weekdayHours, "America/Los_Angeles", instant)).toBe(false);
  });

  it("supports business hours that cross midnight", () => {
    const hours = [{ dayOfWeek: 5, openTime: "20:00", closeTime: "02:00", isClosed: false }];
    expect(isSalonAfterHours(hours, "UTC", new Date("2026-10-03T01:00:00.000Z"))).toBe(false);
    expect(isSalonAfterHours(hours, "UTC", new Date("2026-10-03T03:00:00.000Z"))).toBe(true);
  });

  it("preserves daytime behavior if no schedule is configured", () => {
    expect(isSalonAfterHours([], "UTC", new Date())).toBe(false);
  });

  it("builds a closed-salon answering-service greeting", () => {
    const greeting = buildAfterHoursGreeting("Luxury Nails", "Autumn", () => 0);
    expect(greeting).toContain("Luxury Nails");
    expect(greeting).toContain("after-hours answering service");
  });

  it("says the agent's name in every after-hours greeting", () => {
    for (const r of [0, 0.3, 0.6, 0.9]) expect(buildAfterHoursGreeting("Luxury Nails", "Autumn", () => r)).toContain("this is Autumn");
  });
});

