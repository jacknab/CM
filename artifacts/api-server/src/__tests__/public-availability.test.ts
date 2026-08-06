import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { buildPublicSlotStarts } from "../lib/publicAvailability";

describe("buildPublicSlotStarts", () => {
  it("never offers a slot at or after a 7:00 PM Mountain closing time with 90-minute buffer", () => {
    const slots = buildPublicSlotStarts({
      date: "2026-08-03",
      openTime: "09:00",
      closeTime: "19:00",
      durationMinutes: 30,
      intervalMinutes: 30,
      timezone: "America/Denver",
    });

    const localTimes = slots.map((slot) => formatInTimeZone(slot, "America/Denver", "HH:mm"));
    // The latest appointment may start 90 minutes before closing.
    expect(localTimes.at(-1)).toBe("17:30");
    expect(localTimes).not.toContain("18:00");
    expect(localTimes).not.toContain("18:30");
    expect(localTimes).not.toContain("19:00");
  });

  it("respects closing minutes and requires the full service to fit with 90-minute buffer", () => {
    const slots = buildPublicSlotStarts({
      date: "2026-08-03",
      openTime: "09:15:00",
      closeTime: "19:30:00",
      durationMinutes: 60,
      intervalMinutes: 15,
      timezone: "America/Denver",
    });

    expect(formatInTimeZone(slots[0], "America/Denver", "HH:mm")).toBe("09:15");
    // A 17:30 start is 90 minutes before close and finishes by closing.
    expect(formatInTimeZone(slots.at(-1)!, "America/Denver", "HH:mm")).toBe("18:00");
  });
});
