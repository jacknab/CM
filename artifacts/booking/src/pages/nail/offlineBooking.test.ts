import { describe, expect, test } from "vitest";
import { bookingTechs, openDaysOffline, openTimesOffline, type OfflineBookingData } from "./offlineBooking";

// America/Phoenix is UTC-7 all year. 2026-10-19 is a Monday, 2026-10-20 a Tuesday, 2026-10-25 a Sunday.
const tz = "America/Phoenix";
const at = (local: string) => Date.parse(`${local}-07:00`);
const base = (): OfflineBookingData => ({
  timezone: tz,
  hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openTime: "09:00", closeTime: "12:00", isClosed: d === 0 })),
  rules: [{ staffId: 1, dayOfWeek: 1, startTime: "10:00", endTime: "12:00" }], // Amy: Mondays 10–12 only
  staff: [{ id: 1, name: "Amy" }, { id: 2, name: "Bo" }],
  skills: new Map([[1, new Set([10, 20])], [2, new Set([10])]]),
  busy: [],
});
const now = at("2026-10-14T08:00:00");

describe("booking a future visit with no connection", () => {
  test("technicians: those who do the service; both services → those who do both", () => {
    expect(bookingTechs(base(), 10, null).map((s) => s.name)).toEqual(["Amy", "Bo"]);
    expect(bookingTechs(base(), 10, 20).map((s) => s.name)).toEqual(["Amy"]);
  });

  test("a technician's times stay inside their own weekly hours", () => {
    const slots = openTimesOffline(base(), { date: "2026-10-19", serviceId: 10, extraServiceId: null, duration: 60, extraDuration: 0, staffId: 1, now });
    expect(slots[0].time).toBe(new Date(at("2026-10-19T10:00:00")).toISOString());
    expect(slots[slots.length - 1].time).toBe(new Date(at("2026-10-19T11:00:00")).toISOString());
    expect(openTimesOffline(base(), { date: "2026-10-20", serviceId: 10, extraServiceId: null, duration: 60, extraDuration: 0, staffId: 1, now })).toEqual([]);
  });

  test("time already booked is not offered", () => {
    const d = { ...base(), busy: [{ staffId: 2, start: at("2026-10-20T09:00:00"), end: at("2026-10-20T10:00:00") }] };
    const times = openTimesOffline(d, { date: "2026-10-20", serviceId: 10, extraServiceId: null, duration: 60, extraDuration: 0, staffId: 2, now }).map((s) => s.time);
    expect(times[0]).toBe(new Date(at("2026-10-20T10:00:00")).toISOString());
  });

  test("two services nobody does both of: the second goes to someone free straight after", () => {
    const d = { ...base(), skills: new Map([[1, new Set([20])], [2, new Set([10])]]), rules: [] };
    const [first] = openTimesOffline(d, { date: "2026-10-20", serviceId: 10, extraServiceId: 20, duration: 90, extraDuration: 30, now });
    expect(first).toMatchObject({ staffName: "Bo", extraStaffName: "Amy" });
  });

  test("days: a closed day and a technician's days off are left out", () => {
    const days = openDaysOffline(base(), { from: "2026-10-19", limit: 3, serviceId: 10, extraServiceId: null, duration: 60, extraDuration: 0, staffId: 1, now }).days;
    expect(days).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
  });
});
