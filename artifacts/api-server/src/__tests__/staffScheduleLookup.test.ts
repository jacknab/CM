import { describe, expect, test } from "vitest";
import { matchByName, scheduleForDay, summarizeSchedules } from "../lib/staffScheduleLookup";

// 2026-10-19 is a Monday, 2026-10-20 a Tuesday, 2026-10-25 a Sunday.
const salonHours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openTime: "09:30", closeTime: "19:00", isClosed: d === 0 }));
const tz = "America/New_York";

describe("technician schedules for the receptionist", () => {
  test("no weekly hours set: works the salon's open hours", () => {
    expect(scheduleForDay({ date: "2026-10-19", timezone: tz, salonHours, rules: [], away: [] }))
      .toMatchObject({ working: true, from: "9:30 AM", to: "7 PM", label: "Mon, Oct 19" });
  });

  test("weekly hours narrow the day, and a day without a line is a day off", () => {
    const rules = [{ dayOfWeek: 1, startTime: "10:00", endTime: "14:00" }];
    expect(scheduleForDay({ date: "2026-10-19", timezone: tz, salonHours, rules, away: [] })).toMatchObject({ working: true, from: "10 AM", to: "2 PM" });
    expect(scheduleForDay({ date: "2026-10-20", timezone: tz, salonHours, rules, away: [] })).toMatchObject({ working: false, note: "day off" });
  });

  test("hours wider than the salon's are cut to the salon's", () => {
    const rules = [{ dayOfWeek: 1, startTime: "00:02", endTime: "23:59" }];
    expect(scheduleForDay({ date: "2026-10-19", timezone: tz, salonHours, rules, away: [] })).toMatchObject({ from: "9:30 AM", to: "7 PM" });
  });

  test("the salon closed is never a working day", () => {
    expect(scheduleForDay({ date: "2026-10-25", timezone: tz, salonHours, rules: [], away: [] })).toMatchObject({ working: false, note: "the salon is closed" });
  });

  test("time away: a whole day off, or noted during the day", () => {
    const allDay = [{ startsAt: new Date("2026-10-19T04:00:00Z"), endsAt: new Date("2026-10-20T04:00:00Z"), allDay: true }];
    expect(scheduleForDay({ date: "2026-10-19", timezone: tz, salonHours, rules: [], away: allDay })).toMatchObject({ working: false, note: "away" });
    const lunch = [{ startsAt: new Date("2026-10-19T16:00:00Z"), endsAt: new Date("2026-10-19T17:00:00Z"), allDay: false }];
    expect(scheduleForDay({ date: "2026-10-19", timezone: tz, salonHours, rules: [], away: lunch })).toMatchObject({ working: true, note: "away 12:00 PM–1:00 PM" });
  });

  test("names: first name, full name, any case", () => {
    const staff = [{ name: "Tom Lam" }, { name: "Linda Mara" }, { name: "Tim Tr" }];
    expect(matchByName(staff, "tom")).toEqual([{ name: "Tom Lam" }]);
    expect(matchByName(staff, "Linda Mara")).toEqual([{ name: "Linda Mara" }]);
    expect(matchByName(staff, "Zed")).toEqual([]);
  });

  test("an unknown name lists who does work here", () => {
    expect(summarizeSchedules({ schedules: [], allNames: ["Tom Lam", "Linda Mara"] }, "Zed")).toContain("Tom Lam, Linda Mara");
  });
});
