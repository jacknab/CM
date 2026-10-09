import { toZonedTime } from "date-fns-tz";

export interface ConfiguredBusinessHours {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

function minuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Uses only the salon's timezone and configured schedule. Missing/invalid
 * schedules preserve the existing daytime behavior rather than unexpectedly
 * announcing that a salon is closed.
 */
export function isSalonAfterHours(
  hours: ConfiguredBusinessHours[],
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!hours.length) return false;

  const local = toZonedTime(now, timezone || "UTC");
  const day = local.getDay();
  const minute = local.getHours() * 60 + local.getMinutes();
  const byDay = new Map(hours.map((entry) => [entry.dayOfWeek, entry]));
  const today = byDay.get(day);

  if (today && !today.isClosed) {
    const open = minuteOfDay(today.openTime);
    const close = minuteOfDay(today.closeTime);
    if (open !== null && close !== null) {
      if (open < close && minute >= open && minute < close) return false;
      if (open > close && minute >= open) return false; // Overnight shift, opening day.
      if (open === close) return false; // Common representation for open 24 hours.
    }
  }

  // A previous day's overnight schedule remains open after midnight.
  const previous = byDay.get((day + 6) % 7);
  if (previous && !previous.isClosed) {
    const open = minuteOfDay(previous.openTime);
    const close = minuteOfDay(previous.closeTime);
    if (open !== null && close !== null && open > close && minute < close) return false;
  }

  return true;
}

export function buildAfterHoursGreeting(businessName: string, random: () => number = Math.random): string {
  const variants = [
    `Thank you for calling ${businessName}. You've reached our after-hours answering service. How can I help you?`,
    `Thanks for calling ${businessName}. We're currently closed, but you've reached our answering service. What can I help you with?`,
    `${businessName}, after-hours answering service. How can I help?`,
    `Thank you for calling ${businessName}. The salon is closed right now, but I can still help with an appointment or answer questions.`,
  ];
  return variants[Math.floor(random() * variants.length)] ?? variants[0];
}

