import { addDays, startOfWeek, endOfWeek, format, startOfDay, getDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export interface ParsedTimeInput {
  type: "exact_date" | "date_range" | "earliest" | "ambiguous";
  date?: string;
  dateRange?: { start: string; end: string };
  timeRange?: { start: string; end: string };
  earliest?: boolean;
  raw: string;
  parsed: boolean;
  error?: string;
}

type DayNum = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_NAMES: Record<string, DayNum> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const TIME_OF_DAY: Record<string, { start: string; end: string }> = {
  morning:   { start: "08:00", end: "12:00" },
  afternoon: { start: "12:00", end: "17:00" },
  evening:   { start: "17:00", end: "21:00" },
  night:     { start: "18:00", end: "22:00" },
};

function fmt(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function matchTimeOfDay(text: string): { start: string; end: string } | undefined {
  for (const [name, range] of Object.entries(TIME_OF_DAY)) {
    if (text.includes(name)) return range;
  }
  return undefined;
}

function getNextWeekday(from: Date, day: DayNum, forceNext = false): Date {
  const cur = getDay(from) as DayNum;
  let diff = day - cur;
  if (diff < 0 || (diff === 0 && forceNext)) diff += 7;
  if (diff === 0 && !forceNext) diff = 0;
  if (diff <= 0) diff += 7;
  return addDays(from, diff);
}

function parseTimeToken(token: string, ampm?: string): string | null {
  const parts = token.split(":");
  let h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Parse natural language time input into structured date/time data.
 *
 * Handles: "tomorrow", "tomorrow afternoon", "Friday after 10",
 *          "next week", "anytime this week", "earliest available", etc.
 *
 * @param raw      The raw natural-language string from the caller or AI.
 * @param timezone IANA timezone for the salon (e.g. "America/New_York").
 * @param now      Override "now" for testing. Defaults to current time.
 */
export function parseNLTimeInput(
  raw: string,
  timezone: string,
  now?: Date,
): ParsedTimeInput {
  const base = now ?? new Date();
  const tz = timezone || "UTC";
  const nowInTz = toZonedTime(base, tz);
  const today = startOfDay(nowInTz);
  const lc = raw.toLowerCase().trim();

  // Already a structured ISO date — pass through immediately.
  if (/^\d{4}-\d{2}-\d{2}/.test(lc)) {
    return { type: "exact_date", date: lc.slice(0, 10), raw, parsed: true };
  }

  // "today"
  if (/^today/.test(lc)) {
    const tod = matchTimeOfDay(lc);
    return { type: "exact_date", date: fmt(today), raw, parsed: true, ...(tod ? { timeRange: tod } : {}) };
  }

  // "tomorrow" / "tomorrow afternoon" / "tomorrow morning"
  if (/^tomorrow/.test(lc)) {
    const date = fmt(addDays(today, 1));
    const tod = matchTimeOfDay(lc);
    return { type: "exact_date", date, raw, parsed: true, ...(tod ? { timeRange: tod } : {}) };
  }

  // "earliest available" / "first available" / "as soon as possible" / "asap"
  if (/earliest|first available|as soon as|asap/.test(lc)) {
    return { type: "earliest", earliest: true, raw, parsed: true };
  }

  // "anytime" / "any time" → this week Mon–Fri
  if (/^anytime$|^any time$/.test(lc)) {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return {
      type: "date_range",
      dateRange: { start: fmt(weekStart), end: fmt(weekEnd) },
      raw,
      parsed: true,
    };
  }

  // "anytime this week" / "this week"
  if (/this week/.test(lc) || /anytime this/.test(lc)) {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return {
      type: "date_range",
      dateRange: { start: fmt(weekStart), end: fmt(weekEnd) },
      raw,
      parsed: true,
    };
  }

  // "next week"
  if (/next week/.test(lc)) {
    const nextMonday = addDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
    const nextFriday = addDays(nextMonday, 4);
    return {
      type: "date_range",
      dateRange: { start: fmt(nextMonday), end: fmt(nextFriday) },
      raw,
      parsed: true,
    };
  }

  // Named weekday: "Friday" / "next Friday" / "Friday after 10" / "Friday afternoon"
  for (const [name, dayNum] of Object.entries(DAY_NAMES)) {
    if (lc.includes(name)) {
      const forceNext = lc.includes("next");
      const targetDate = getNextWeekday(today, dayNum, forceNext);

      const afterMatch = lc.match(/after\s+(\d+(?::\d+)?)\s*(am|pm)?/);
      let timeRange: { start: string; end: string } | undefined;
      if (afterMatch) {
        const t = parseTimeToken(afterMatch[1], afterMatch[2] as "am" | "pm" | undefined);
        if (t) timeRange = { start: t, end: "22:00" };
      }

      const tod = timeRange ? undefined : matchTimeOfDay(lc);

      return {
        type: "exact_date",
        date: fmt(targetDate),
        raw,
        parsed: true,
        ...(timeRange ? { timeRange } : tod ? { timeRange: tod } : {}),
      };
    }
  }

  // Fallback: try JS Date constructor (handles some formats like "Dec 5")
  const fallback = new Date(raw);
  if (!isNaN(fallback.getTime())) {
    return { type: "exact_date", date: fmt(fallback), raw, parsed: true };
  }

  // Could not parse — return ambiguous so the AI can re-prompt
  return {
    type: "ambiguous",
    raw,
    parsed: false,
    error: `Could not parse time expression: "${raw}". Please ask the caller to specify a date (e.g. "this Friday" or "tomorrow afternoon").`,
  };
}
