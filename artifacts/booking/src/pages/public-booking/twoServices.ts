/**
 * Booking two services in one visit.
 *
 * A client can book up to two services together, two and a half hours in all (the server holds the same
 * limits). The visit is saved as one appointment per service, back to back: with the same technician when
 * one person performs both, otherwise with a second technician straight after the first. Every booking
 * theme uses these helpers so they all ask the server for the same thing.
 */
import { toast } from "@/hooks/use-toast";

export const MAX_SERVICES = 2;
export const MAX_VISIT_MINUTES = 150;

type Picked = { id: number; duration: number };

/** Why this service can't be added to what is already chosen, or null when it can. */
export function whyNotAdd(selected: readonly Picked[], next: Picked): string | null {
  if (selected.length >= MAX_SERVICES) return "You can book up to 2 services together. Remove one to choose another.";
  if (selected.reduce((sum, s) => sum + s.duration, 0) + next.duration > MAX_VISIT_MINUTES) {
    return "Two services can be booked together for up to 2½ hours. Please book this one separately.";
  }
  return null;
}

/** True when the service can be added; otherwise tells the client why not and returns false. */
export function canAddService(selected: readonly Picked[], next: Picked): boolean {
  const why = whyNotAdd(selected, next);
  if (why) toast({ title: why });
  return !why;
}

/** Extra query fields for the open-times request: the second service. `duration` there stays the whole visit. */
export function extraServiceQuery(selected: readonly Picked[]): Record<string, string> {
  return selected[1] ? { extraServiceId: String(selected[1].id) } : {};
}

/**
 * The service fields of a booking request: the first service's own length (the server adds the time of
 * its add-ons itself — sending the visit total here used to count add-ons twice) and the second service.
 */
export function bookingServiceFields(selected: readonly Picked[]): { duration: number; extraServiceId?: number } {
  return { duration: selected[0]?.duration ?? 0, ...(selected[1] ? { extraServiceId: selected[1].id } : {}) };
}

/** "With Amy", or "With Amy, then Lisa" when the second service is with someone else. */
export function technicianLine(slot: { staffName: string; extraStaffName?: string } | null | undefined): string {
  if (!slot) return "";
  return slot.extraStaffName && slot.extraStaffName !== slot.staffName ? `${slot.staffName}, then ${slot.extraStaffName}` : slot.staffName;
}
