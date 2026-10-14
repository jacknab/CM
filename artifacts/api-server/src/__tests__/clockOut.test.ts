import { describe, expect, test } from "vitest";
import { clockOutTimeFor } from "../lib/clockOut";

const tz = "America/Phoenix"; // UTC-7 all year
const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, closeTime: "19:00", isClosed: d === 0 }));
const now = new Date("2026-10-14T17:00:00Z"); // Wed Oct 14, 10:00 AM in Phoenix

describe("when a forgotten clock-in ends", () => {
  test("today's clock-in ends now", () => {
    expect(clockOutTimeFor({ clockIn: new Date("2026-10-14T16:00:00Z"), workDate: "2026-10-14", now, timezone: tz, hours })).toEqual(now);
  });

  test("one left open from an earlier day ends at that day's closing time, not now", () => {
    // Mon Oct 12, clocked in 9 AM Phoenix; the salon closed at 7 PM.
    expect(clockOutTimeFor({ clockIn: new Date("2026-10-12T16:00:00Z"), workDate: "2026-10-12", now, timezone: tz, hours }))
      .toEqual(new Date("2026-10-13T02:00:00Z"));
  });

  test("clocked in after closing, or on a closed day: the end of that day", () => {
    expect(clockOutTimeFor({ clockIn: new Date("2026-10-13T03:00:00Z"), workDate: "2026-10-12", now, timezone: tz, hours }))
      .toEqual(new Date("2026-10-13T06:59:59Z"));
    expect(clockOutTimeFor({ clockIn: new Date("2026-10-11T17:00:00Z"), workDate: "2026-10-11", now, timezone: tz, hours }))
      .toEqual(new Date("2026-10-12T06:59:59Z"));
  });
});
