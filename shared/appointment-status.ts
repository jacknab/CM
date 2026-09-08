import { z } from "zod";

/**
 * Canonical appointment lifecycle statuses.
 *
 *   pending    → "Booked"      — created, client not yet checked in
 *   confirmed  → "Confirmed"   — client has checked in (kiosk or staff)
 *   started    → "In Progress" — service underway (auto at start time, or manual)
 *   completed  → "Done"        — finished / checked out
 *   cancelled  → "Cancelled"
 *   no_show    → "No Show"
 *
 * "Booked" keeps the stored token `pending` — this is a label/behaviour change,
 * not a DB rename. Retired legacy values: checked_in, in_progress, finished,
 * done, "no-show" (hyphen). `late` is derived in the UI and never stored.
 */
export const ALL_APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "started",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof ALL_APPOINTMENT_STATUSES)[number];

/** Non-terminal — appointment is still "live" on the calendar. */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "pending",
  "confirmed",
  "started",
];

/** Terminal — appointment will not change state again on its own. */
export const TERMINAL_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "completed",
  "cancelled",
  "no_show",
];

export const appointmentStatusEnum = z.enum(ALL_APPOINTMENT_STATUSES);

const LEGACY_STATUS_MAP: Record<string, AppointmentStatus> = {
  checked_in: "confirmed",
  "checked-in": "confirmed",
  in_progress: "started",
  "in-progress": "started",
  finished: "completed",
  done: "completed",
  "no-show": "no_show",
  noshow: "no_show",
};

/**
 * Map any historical / mistyped status onto the canonical set. Unknown values
 * fall back to `pending` so a bad write can never leave an appointment in a
 * state no screen understands.
 */
export function normalizeAppointmentStatus(
  value: string | null | undefined,
): AppointmentStatus {
  if (!value) return "pending";
  const v = String(value).trim().toLowerCase();
  if ((ALL_APPOINTMENT_STATUSES as readonly string[]).includes(v)) {
    return v as AppointmentStatus;
  }
  return LEGACY_STATUS_MAP[v] ?? "pending";
}
