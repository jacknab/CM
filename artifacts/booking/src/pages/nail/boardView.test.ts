import { describe, expect, it } from "vitest";
import { bookingsForDetail, businessDayKey, calendarBookingsForBoard, hasNewWaitingEntityForPhone, waitingEntityKeys } from "./boardView";
import type { BoardDayBooking, BoardMarker, BoardTicket } from "./nailApi";

const booking = (id: number, status: string, isWalkIn: boolean): BoardDayBooking => ({
  id, status, isWalkIn, ticketNumber: id, date: "2026-09-27T12:00:00Z", duration: 30,
  clientName: `Client ${id}`, serviceName: "Manicure", staffName: null,
});

describe("nail board views", () => {
  it("keeps appointment detail tabs mutually exclusive", () => {
    const rows = [booking(1, "confirmed", false), booking(2, "completed", false), booking(3, "no_show", false), booking(4, "confirmed", true)];
    expect(bookingsForDetail(rows, "appointments").map((row) => row.id)).toEqual([1]);
    expect(bookingsForDetail(rows, "completed").map((row) => row.id)).toEqual([2]);
    expect(bookingsForDetail(rows, "no-shows").map((row) => row.id)).toEqual([3]);
    expect(bookingsForDetail(rows, "walk-ins").map((row) => row.id)).toEqual([4]);
  });

  it("recovers scheduled appointments from calendar data when the board only has totals", () => {
    const date = "2026-09-29T16:00:00Z";
    const rows = calendarBookingsForBoard([
      { id: 1, date, createdAt: "2026-09-25T16:00:00Z", duration: 45, status: "pending", customer: { fullName: "Alex Smith" }, service: { name: "Gel manicure" }, staff: { name: "Sam" } },
      { id: 2, date, createdAt: date, duration: 30, status: "confirmed" },
      { id: 3, date, duration: 30, status: "cancelled" },
      { id: 4, date: "2026-09-30T16:00:00Z", duration: 30, status: "pending" },
    ], "America/New_York", new Date("2026-09-29T17:00:00Z"));
    expect(bookingsForDetail(rows, "appointments")).toEqual([{
      id: 1, ticketNumber: null, date, duration: 45, status: "pending", clientName: "Alex Smith",
      serviceName: "Gel manicure", staffName: "Sam", isWalkIn: false,
    }]);
    expect(bookingsForDetail(rows, "walk-ins").map((row) => row.id)).toEqual([2]);
  });

  it("uses the salon's 4 AM business-day boundary rather than the browser date", () => {
    expect(businessDayKey("2026-09-30T07:30:00Z", "America/New_York")).toBe("2026-09-29");
    expect(businessDayKey("2026-09-30T08:30:00Z", "America/New_York")).toBe("2026-09-30");
  });

  it("does not treat another client's check-in as completion of the paired flow", () => {
    const baseline = new Set<string>();
    const marker = (id: number, phone: string): BoardMarker => ({ id, phone, ticketNumber: id, clientId: id, clientName: "Client", createdAt: "2026-09-27T12:00:00Z" });
    expect(hasNewWaitingEntityForPhone([], [marker(1, "480-555-1111")], baseline, "4805552222")).toBe(false);
    expect(hasNewWaitingEntityForPhone([], [marker(1, "(480) 555-2222")], baseline, "4805552222")).toBe(true);
  });

  it("ignores a matching client who was already waiting when Check-In opened", () => {
    const ticket = { id: 9, status: "confirmed", client: { phone: "4805552222" } } as BoardTicket;
    const baseline = waitingEntityKeys([ticket], []);
    expect(hasNewWaitingEntityForPhone([ticket], [], baseline, "4805552222")).toBe(false);
  });
});
