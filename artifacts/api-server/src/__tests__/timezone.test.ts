/**
 * Certxa Timezone Tests
 *
 * Validates that UTC timestamps are correctly converted to salon-local time
 * across the timezones Certxa salons operate in.
 *
 * Run with: pnpm --filter @workspace/api-server test
 *
 * The confirmed failure this file tests against:
 *   UTC  2026-07-27T06:17:00Z
 *   Was displayed as:  July 26, 2026 6:17 PM   (WRONG — browser TZ applied)
 *   Must display as:   July 27, 2026 12:17 AM   (America/Denver, MDT = UTC-6)
 */

import { createTimeService } from "../lib/timeService";
import { formatInTimeZone } from "date-fns-tz";

// ── The confirmed bug timestamp ──────────────────────────────────────────────
const BUG_UTC = new Date("2026-07-27T06:17:00Z");

// ── Helpers ──────────────────────────────────────────────────────────────────
function toDisplayString(utc: Date, timezone: string): string {
  return formatInTimeZone(utc, timezone, "MMMM d, yyyy h:mm a");
}

// ── Denver: confirmed failure case ───────────────────────────────────────────
describe("America/Denver (MDT = UTC-6)", () => {
  const ts = createTimeService("America/Denver");

  test("bug reproduced: UTC 06:17 → Denver 12:17 AM same day (not July 26 6:17 PM)", () => {
    const local = toDisplayString(BUG_UTC, "America/Denver");
    // Must NOT be July 26 — that is the browser-TZ bug
    expect(local).not.toContain("July 26");
    // Must be July 27, 12:17 AM
    expect(local).toBe("July 27, 2026 12:17 AM");
  });

  test("todayString() returns salon-local date, not server UTC date", () => {
    // At UTC 06:17 on July 27, Denver is still at 00:17 on July 27
    const localDate = ts.toLocalDateString(BUG_UTC);
    expect(localDate).toBe("2026-07-27");
  });

  test("getLocalHour() returns 0 (midnight) not 6 (UTC hour)", () => {
    expect(ts.getLocalHour(BUG_UTC)).toBe(0);
  });

  test("getLocalDayOfWeek() returns Sunday (0) for 2026-07-27", () => {
    // July 27, 2026 is a Monday (1)
    expect(ts.getLocalDayOfWeek(BUG_UTC)).toBe(1);
  });

  test("isSameLocalDay() correctly spans midnight boundary", () => {
    const justBeforeMidnight = new Date("2026-07-27T05:59:00Z"); // 11:59 PM Denver July 26
    const justAfterMidnight  = new Date("2026-07-27T06:01:00Z"); // 12:01 AM Denver July 27
    expect(ts.isSameLocalDay(justBeforeMidnight, justAfterMidnight)).toBe(false);
    expect(ts.isSameLocalDay(BUG_UTC, justAfterMidnight)).toBe(true);
  });

  test("dayUtcRange() for July 27 Denver covers the correct UTC window", () => {
    const { start, end } = ts.dayUtcRange("2026-07-27");
    // Denver MDT is UTC-6: July 27 starts at 06:00 UTC, ends at 06:00 UTC July 28
    expect(start.toISOString()).toBe("2026-07-27T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-28T06:00:00.000Z");
  });

  test("toUtc() correctly converts salon local time to UTC", () => {
    const utc = ts.toUtc("2026-07-27T00:17:00");
    expect(utc.toISOString()).toBe("2026-07-27T06:17:00.000Z");
  });

  test("localTimeToUtc() builds UTC from date+time strings", () => {
    const utc = ts.localTimeToUtc("2026-07-27", "00:17");
    expect(utc.toISOString()).toBe("2026-07-27T06:17:00.000Z");
  });
});

// ── New York (EDT = UTC-4) ────────────────────────────────────────────────────
describe("America/New_York (EDT = UTC-4)", () => {
  const ts = createTimeService("America/New_York");

  test("UTC 06:17 → New York 2:17 AM same day", () => {
    const local = toDisplayString(BUG_UTC, "America/New_York");
    expect(local).toBe("July 27, 2026 2:17 AM");
  });

  test("getLocalHour() returns 2", () => {
    expect(ts.getLocalHour(BUG_UTC)).toBe(2);
  });

  test("dayUtcRange() for July 27 NY covers the correct UTC window", () => {
    const { start, end } = ts.dayUtcRange("2026-07-27");
    expect(start.toISOString()).toBe("2026-07-27T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-28T04:00:00.000Z");
  });

  test("isSameLocalDay() across NY midnight boundary", () => {
    const beforeMidnight = new Date("2026-07-27T03:59:00Z"); // 11:59 PM NY July 26
    const afterMidnight  = new Date("2026-07-27T04:01:00Z"); // 12:01 AM NY July 27
    expect(ts.isSameLocalDay(beforeMidnight, afterMidnight)).toBe(false);
  });
});

// ── Los Angeles (PDT = UTC-7) ─────────────────────────────────────────────────
describe("America/Los_Angeles (PDT = UTC-7)", () => {
  const ts = createTimeService("America/Los_Angeles");

  test("UTC 06:17 → Los Angeles 11:17 PM July 26 (previous day!)", () => {
    const local = toDisplayString(BUG_UTC, "America/Los_Angeles");
    expect(local).toBe("July 26, 2026 11:17 PM");
  });

  test("getLocalHour() returns 23", () => {
    expect(ts.getLocalHour(BUG_UTC)).toBe(23);
  });

  test("toLocalDateString() returns July 26 in LA (date rollback)", () => {
    expect(ts.toLocalDateString(BUG_UTC)).toBe("2026-07-26");
  });

  test("dayUtcRange() for July 27 LA covers the correct UTC window", () => {
    const { start, end } = ts.dayUtcRange("2026-07-27");
    expect(start.toISOString()).toBe("2026-07-27T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-28T07:00:00.000Z");
  });
});

// ── Vietnam (ICT = UTC+7) ─────────────────────────────────────────────────────
describe("Asia/Ho_Chi_Minh (ICT = UTC+7)", () => {
  const ts = createTimeService("Asia/Ho_Chi_Minh");

  test("UTC 06:17 → Vietnam 1:17 PM same day", () => {
    const local = toDisplayString(BUG_UTC, "Asia/Ho_Chi_Minh");
    expect(local).toBe("July 27, 2026 1:17 PM");
  });

  test("getLocalHour() returns 13", () => {
    expect(ts.getLocalHour(BUG_UTC)).toBe(13);
  });

  test("dayUtcRange() for July 27 Vietnam covers the correct UTC window", () => {
    const { start, end } = ts.dayUtcRange("2026-07-27");
    // ICT is UTC+7: July 27 starts at July 26 17:00 UTC
    expect(start.toISOString()).toBe("2026-07-26T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-27T17:00:00.000Z");
  });

  test("isSameSalonDay() does NOT confuse UTC midnight with Vietnam day boundary", () => {
    const utcMidnight = new Date("2026-07-27T00:00:00Z"); // 7 AM Vietnam July 27
    const utcNoon     = new Date("2026-07-27T12:00:00Z"); // 7 PM Vietnam July 27
    expect(ts.isSameLocalDay(utcMidnight, utcNoon)).toBe(true);
  });
});

// ── Availability generation: same-day booking restriction ────────────────────
describe("Same-day booking restriction across midnight", () => {
  test("Denver: appointment at 11:59 PM local is on July 26, not July 27", () => {
    const ts = createTimeService("America/Denver");
    // 11:59 PM Denver July 26 = 05:59 UTC July 27
    const appt = new Date("2026-07-27T05:59:00Z");
    expect(ts.toLocalDateString(appt)).toBe("2026-07-26");
    expect(ts.isOnDate(appt, "2026-07-26")).toBe(true);
    expect(ts.isOnDate(appt, "2026-07-27")).toBe(false);
  });

  test("NY: isOnDate() correctly identifies the local date", () => {
    const ts = createTimeService("America/New_York");
    // 11:59 PM NY July 26 = 03:59 UTC July 27
    const appt = new Date("2026-07-27T03:59:00Z");
    expect(ts.isOnDate(appt, "2026-07-26")).toBe(true);
    expect(ts.isOnDate(appt, "2026-07-27")).toBe(false);
  });
});

// ── UTC fallback for unconfigured salons ─────────────────────────────────────
describe("UTC fallback", () => {
  test("createTimeService(null) falls back to UTC without throwing", () => {
    const ts = createTimeService(null);
    expect(ts.timezone).toBe("UTC");
    const local = ts.toLocalDateString(BUG_UTC);
    expect(local).toBe("2026-07-27");
  });

  test("createTimeService('') falls back to UTC without throwing", () => {
    expect(() => createTimeService("")).not.toThrow();
    const ts = createTimeService("");
    expect(ts.timezone).toBe("UTC");
  });
});
