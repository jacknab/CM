import { describe, expect, it } from "vitest";
import { bookingsForDetail, businessDayKey, hasNewWaitingEntityForPhone, waitingEntityKeys } from "./boardView";
import type { BoardDayBooking, BoardMarker, BoardTicket } from "./barberApi";

const booking = (id: number, status: string, isWalkIn: boolean): BoardDayBooking => ({
  id, status, isWalkIn, ticketNumber: id, date: "2026-09-27T12:00:00Z", duration: 30,
  clientName: `Client ${id}`, serviceName: "Haircut", staffName: null,
});

describe("barber board views", () => {
  it("lists only walk-ins and completed visits; booked appointments never appear", () => {
    const rows = [booking(1, "confirmed", false), booking(2, "completed", false), booking(3, "no_show", false), booking(4, "confirmed", true)];
    expect(bookingsForDetail(rows, "walk-ins").map((row) => row.id)).toEqual([4]);
    expect(bookingsForDetail(rows, "completed").map((row) => row.id)).toEqual([2]);
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
