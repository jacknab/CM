import type { BoardDayBooking, BoardMarker, BoardTicket } from "./nailApi";

export type DetailKind = "appointments" | "no-shows" | "walk-ins" | "completed";

const isNoShow = (status: string) => status === "no_show" || status === "no-show";

/** The visits behind each detail tile. Walk-ins lists every walk-in of the day whatever became of it, the
 *  same set its tile counts, so a finished walk-in shows under both Walk-ins and Completed (as it is counted
 *  in both). Appointments, Completed and No-shows don't overlap. */
export function bookingsForDetail(bookings: BoardDayBooking[], kind: DetailKind): BoardDayBooking[] {
  if (kind === "completed") return bookings.filter((booking) => booking.status === "completed");
  if (kind === "no-shows") return bookings.filter((booking) => isNoShow(booking.status));
  if (kind === "walk-ins") return bookings.filter((booking) => booking.isWalkIn);
  return bookings.filter((booking) => !booking.isWalkIn && booking.status !== "completed" && !isNoShow(booking.status));
}

/** Older board responses can include glance totals without dayBookings. Recover today's
 * appointments from the calendar endpoint until both sides of the board are deployed. */
export interface CalendarBoardBooking {
  id: number;
  ticketNumber?: number | null;
  date: string;
  duration: number;
  status: string | null;
  createdAt?: string | null;
  checkedInAt?: string | null;
  customer?: { fullName?: string | null } | null;
  service?: { name?: string | null } | null;
  staff?: { name?: string | null } | null;
}

export function businessDayKey(value: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") - 4)).toISOString().slice(0, 10);
}

export function calendarBookingsForBoard(rows: CalendarBoardBooking[], timezone: string, now: Date): BoardDayBooking[] {
  const today = businessDayKey(now, timezone);
  return rows.filter((row) => row.status !== "cancelled" && businessDayKey(row.date, timezone) === today)
    .map((row) => {
      const created = row.createdAt ? +new Date(row.createdAt) : NaN;
      const scheduled = +new Date(row.date);
      const checkedIn = row.checkedInAt ? +new Date(row.checkedInAt) : NaN;
      const isWalkIn = Number.isFinite(created) && (
        Math.abs(created - scheduled) < 15 * 60_000 ||
        (Number.isFinite(checkedIn) && Math.abs(checkedIn - created) < 15 * 60_000)
      );
      return {
        id: row.id, ticketNumber: row.ticketNumber ?? null, date: row.date,
        duration: row.duration ?? 0, status: row.status ?? "pending",
        clientName: row.customer?.fullName || "Guest", serviceName: row.service?.name || "Service",
        staffName: row.staff?.name ?? null, isWalkIn,
      };
    });
}

export const normalizePhoneDigits = (phone: string | null | undefined): string =>
  String(phone ?? "").replace(/\D/g, "").slice(-10);

export function waitingEntityKeys(tickets: BoardTicket[], markers: BoardMarker[]): Set<string> {
  return new Set([
    ...tickets.filter((ticket) => ticket.status === "confirmed").map((ticket) => `ticket:${ticket.id}`),
    ...markers.map((marker) => `marker:${marker.id}`),
  ]);
}

/**
 * Paired-tablet check-in completion must belong to the phone entered on that tablet. Merely seeing
 * the salon's waiting count rise could be a different client checking in on another station.
 */
export function hasNewWaitingEntityForPhone(
  tickets: BoardTicket[],
  markers: BoardMarker[],
  baseline: ReadonlySet<string>,
  phone: string,
): boolean {
  const digits = normalizePhoneDigits(phone);
  if (digits.length !== 10) return false;
  return tickets.some((ticket) =>
    ticket.status === "confirmed" &&
    !baseline.has(`ticket:${ticket.id}`) &&
    normalizePhoneDigits(ticket.client.phone) === digits,
  ) || markers.some((marker) =>
    !baseline.has(`marker:${marker.id}`) && normalizePhoneDigits(marker.phone) === digits,
  );
}

/** Where a walk-in is now, for its card. Appointment statuses and kiosk check-in statuses (a check-in that
 *  never got a ticket) both come through here. */
export function walkInState(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "started" || status === "serving") return "In service";
  if (isNoShow(status)) return "No-show";
  if (status === "expired") return "Never served";
  return "Waiting";
}
