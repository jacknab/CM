import { describe, expect, it } from "vitest";
import { dayCloseDue, lastClosingTime, type DayHours } from "./autoDayClose";

// Store 2's hours (America/Phoenix, UTC-7): Mon 09:30–19:00, Sun 12:00–17:00, Tue 09:30–23:59.
const hours: DayHours[] = [
  { dayOfWeek: 0, openTime: "12:00", closeTime: "17:00" },
  { dayOfWeek: 1, openTime: "09:30", closeTime: "19:00" },
  { dayOfWeek: 2, openTime: "09:30", closeTime: "23:59" },
  { dayOfWeek: 3, openTime: "09:30", closeTime: "22:00" },
  { dayOfWeek: 4, openTime: "09:30", closeTime: "19:00" },
  { dayOfWeek: 5, openTime: "09:30", closeTime: "19:00" },
  { dayOfWeek: 6, openTime: "09:30", closeTime: "22:00" },
];
const tz = "America/Phoenix";
const at = (local: string) => new Date(`${local}-07:00`); // Phoenix has no daylight saving

describe("auto Day Close", () => {
  it("is not due while the salon is open", () => {
    expect(lastClosingTime(hours, tz, at("2026-10-26T15:00:00"))).toBeNull(); // Monday afternoon
    expect(dayCloseDue(hours, tz, at("2026-10-26T15:00:00"), null)).toBe(false);
  });
  it("is due after closing time when Day Close has not run since", () => {
    expect(lastClosingTime(hours, tz, at("2026-10-26T19:05:00"))?.toISOString()).toBe(at("2026-10-26T19:00:00").toISOString());
    expect(dayCloseDue(hours, tz, at("2026-10-26T19:05:00"), at("2026-10-25T17:30:00"))).toBe(true);
  });
  it("is not due again once Day Close has run after closing — not that night, not the next morning", () => {
    const closed = at("2026-10-26T19:20:00");
    expect(dayCloseDue(hours, tz, at("2026-10-26T21:00:00"), closed)).toBe(false);
    expect(dayCloseDue(hours, tz, at("2026-10-27T08:00:00"), closed)).toBe(false);
  });
  it("is due the next morning before opening when last night's close was missed", () => {
    expect(dayCloseDue(hours, tz, at("2026-10-27T08:00:00"), at("2026-10-25T17:30:00"))).toBe(true);
  });
  it("handles a salon that closes after midnight", () => {
    const late: DayHours[] = hours.map((h) => (h.dayOfWeek === 5 ? { ...h, openTime: "10:00", closeTime: "01:00" } : h));
    expect(lastClosingTime(late, tz, at("2026-10-31T00:30:00"))).toBeNull(); // still open (Friday's hours)
    expect(dayCloseDue(late, tz, at("2026-10-31T01:15:00"), null)).toBe(true);
  });
  it("skips a day the salon is closed", () => {
    const sundayClosed = hours.map((h) => (h.dayOfWeek === 0 ? { ...h, isClosed: true } : h));
    // Sunday 3 PM: closed all day, so the last closing is Saturday's 22:00.
    expect(lastClosingTime(sundayClosed, tz, at("2026-10-25T15:00:00"))?.toISOString()).toBe(at("2026-10-24T22:00:00").toISOString());
  });
});
