import { fromZonedTime } from "date-fns-tz";

function normalizeBusinessTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid business time: ${time}`);
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

/**
 * Builds appointment starts in the store's timezone. A slot is returned only
 * when the complete service duration fits on or before closing time and its
 * start is at least 90 minutes before closing.
 */
export function buildPublicSlotStarts(input: {
  date: string;
  openTime: string;
  closeTime: string;
  durationMinutes: number;
  intervalMinutes: number;
  timezone: string;
}): Date[] {
  const { date, openTime, closeTime, durationMinutes, intervalMinutes, timezone } = input;
  if (durationMinutes <= 0 || intervalMinutes <= 0) return [];

  const opensAt = fromZonedTime(
    new Date(`${date}T${normalizeBusinessTime(openTime)}`),
    timezone,
  );
  const closesAt = fromZonedTime(
    new Date(`${date}T${normalizeBusinessTime(closeTime)}`),
    timezone,
  );
  if (closesAt <= opensAt) return [];

  const latestStartMs = closesAt.getTime() - 90 * 60_000;

  const starts: Date[] = [];
  const intervalMs = intervalMinutes * 60_000;
  const durationMs = durationMinutes * 60_000;

  for (let slotStartMs = opensAt.getTime(); slotStartMs <= latestStartMs; slotStartMs += intervalMs) {
    if (slotStartMs + durationMs <= closesAt.getTime()) {
      starts.push(new Date(slotStartMs));
    }
  }

  return starts;
}
