/**
 * hours-parser.ts — Natural language business hours parser
 *
 * Handles the most common "Mon–Sat 9am–6pm" style inputs without AI.
 * Future AI extension point: swap parseHours() implementation for a GPT-4o-mini
 * structured output call without changing any chat UI code.
 */

export interface DayHours {
  dayOfWeek: number; // 0 = Sunday
  openTime: string;  // "HH:MM"
  closeTime: string; // "HH:MM"
  isClosed: boolean;
}

export interface ParseResult {
  success: boolean;
  hours: DayHours[];
  raw?: string; // original input, for debugging
}

// ── Day name → index mapping ──────────────────────────────────────────────────

const DAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  // shorthand ordinals
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
};

const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseDay(token: string): number | null {
  const t = token.toLowerCase().trim();
  if (t in DAY_ALIASES) return DAY_ALIASES[t];
  return null;
}

// ── Time parsing ──────────────────────────────────────────────────────────────

function parseTime(token: string): string | null {
  token = token.trim().toLowerCase().replace(/\s+/g, "");

  // Match patterns like: 9am, 9:30am, 9:30, 9, 17:00, 1730
  const match = token.match(
    /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?([ap]m?)?$/
  );
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2] ?? "0", 10);
  const period = match[3];

  if (period?.startsWith("p") && hour !== 12) hour += 12;
  if (period?.startsWith("a") && hour === 12) hour = 0;

  // Handle bare numbers: if no am/pm and hour <= 7, assume pm for closing times
  // but we can't know intent here — just clamp to 0-23
  if (hour > 23 || min > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ── Range parsing (e.g. "Mon-Sat", "Mon through Friday", "Mon,Tue,Wed") ──────

function expandDayRange(from: number, to: number): number[] {
  const days: number[] = [];
  // Handle wrap-around (e.g. Fri–Mon)
  let d = from;
  while (true) {
    days.push(d);
    if (d === to) break;
    d = (d + 1) % 7;
    if (days.length > 7) break; // safety
  }
  return days;
}

function parseDayGroup(token: string): number[] | null {
  token = token.trim();

  // Range: "mon-fri", "mon through fri", "mon to fri"
  const rangeMatch = token.match(
    /^([a-z]+)\s*(?:-|–|—|through|to)\s*([a-z]+)$/i
  );
  if (rangeMatch) {
    const from = parseDay(rangeMatch[1]);
    const to = parseDay(rangeMatch[2]);
    if (from !== null && to !== null) return expandDayRange(from, to);
  }

  // List: "mon,tue,wed" or "mon, tue, wed"
  if (token.includes(",")) {
    const days: number[] = [];
    for (const part of token.split(",")) {
      const d = parseDay(part.trim());
      if (d === null) return null;
      days.push(d);
    }
    return days;
  }

  // Single day
  const single = parseDay(token);
  if (single !== null) return [single];

  // "daily" / "every day" / "weekdays" / "weekends"
  const lower = token.toLowerCase();
  if (lower === "daily" || lower === "every day" || lower === "all week") {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (lower === "weekdays" || lower === "weekday") {
    return [1, 2, 3, 4, 5];
  }
  if (lower === "weekends" || lower === "weekend") {
    return [0, 6];
  }

  return null;
}

// ── Build default closed days array ──────────────────────────────────────────

function buildDefaultHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    openTime: "09:00",
    closeTime: "18:00",
    isClosed: true,
  }));
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a natural language hours string into structured DayHours[].
 *
 * Examples:
 *   "Mon-Sat 9am-6pm"
 *   "Mon–Fri 10am–8pm, Sat 10am–6pm, closed Sunday"
 *   "Open daily 9am to 7pm"
 *   "Closed Sundays and Mondays, Tue-Sat 9-6"
 *   "Monday through Saturday 9am to 6pm, Sunday closed"
 *
 * Returns { success: false } if no recognizable pattern found.
 */
export function parseHours(text: string): ParseResult {
  const result = buildDefaultHours();
  let anyMatch = false;

  // Normalize
  const normalized = text
    .toLowerCase()
    .replace(/\band\b/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  // Split on semicolons or commas that separate day groups
  // e.g. "Mon-Fri 9-5, Sat 10-4, Sun closed"
  const segments = normalized.split(/[,;]/);

  for (const rawSeg of segments) {
    const seg = rawSeg.trim();
    if (!seg) continue;

    // "closed [daygroup]" or "[daygroup] closed"
    const closedMatch =
      seg.match(/^closed\s+(.+)$/) ||
      seg.match(/^(.+)\s+closed$/);

    if (closedMatch) {
      const days = parseDayGroup(closedMatch[1].trim());
      if (days) {
        for (const d of days) {
          result[d].isClosed = true;
        }
        anyMatch = true;
        continue;
      }
    }

    // "[daygroup] [openTime] [to|-] [closeTime]" or "[daygroup] [openTime]-[closeTime]"
    // e.g. "mon-sat 9am-6pm" or "mon-fri 10am to 8pm"
    const hoursMatch = seg.match(
      /^(.+?)\s+(\d{1,2}(?::\d{2})?(?:[ap]m?)?)\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?(?:[ap]m?)?)$/i
    );

    if (hoursMatch) {
      const days = parseDayGroup(hoursMatch[1].trim());
      const open = parseTime(hoursMatch[2]);
      const close = parseTime(hoursMatch[3]);

      if (days && open && close) {
        for (const d of days) {
          result[d].isClosed = false;
          result[d].openTime = open;
          result[d].closeTime = close;
        }
        anyMatch = true;
        continue;
      }
    }

    // "open [daygroup] [openTime]-[closeTime]" prefix
    const openPrefix = seg.match(/^open\s+(.+)$/);
    if (openPrefix) {
      const inner = openPrefix[1].trim();
      const hoursMatch2 = inner.match(
        /^(.+?)\s+(\d{1,2}(?::\d{2})?(?:[ap]m?)?)\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?(?:[ap]m?)?)$/i
      );
      if (hoursMatch2) {
        const days = parseDayGroup(hoursMatch2[1].trim());
        const open = parseTime(hoursMatch2[2]);
        const close = parseTime(hoursMatch2[3]);
        if (days && open && close) {
          for (const d of days) {
            result[d].isClosed = false;
            result[d].openTime = open;
            result[d].closeTime = close;
          }
          anyMatch = true;
          continue;
        }
      }
    }

    // "daily 9am-6pm" shorthand (no day group prefix)
    const dailyMatch = seg.match(
      /^(\d{1,2}(?::\d{2})?(?:[ap]m?)?)\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?(?:[ap]m?)?)$/i
    );
    if (dailyMatch) {
      const open = parseTime(dailyMatch[1]);
      const close = parseTime(dailyMatch[2]);
      if (open && close) {
        // Apply to all days not yet set in this parse pass
        for (const d of result) {
          d.isClosed = false;
          d.openTime = open;
          d.closeTime = close;
        }
        anyMatch = true;
        continue;
      }
    }
  }

  return anyMatch
    ? { success: true, hours: result, raw: text }
    : { success: false, hours: result, raw: text };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "pm" : "am";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${period}` : `${h}:${String(m).padStart(2, "0")}${period}`;
}

export function summariseHours(hours: DayHours[]): string {
  const open = hours.filter((d) => !d.isClosed);
  if (open.length === 0) return "Closed all week";
  if (open.length === 7) {
    const first = open[0];
    if (open.every((d) => d.openTime === first.openTime && d.closeTime === first.closeTime)) {
      return `Daily ${formatTime12h(first.openTime)}–${formatTime12h(first.closeTime)}`;
    }
  }
  // Group consecutive days with same hours
  const groups: { label: string; open: string; close: string }[] = [];
  let i = 0;
  while (i < 7) {
    const d = hours[i];
    if (d.isClosed) { i++; continue; }
    let j = i;
    while (
      j + 1 < 7 &&
      !hours[j + 1].isClosed &&
      hours[j + 1].openTime === d.openTime &&
      hours[j + 1].closeTime === d.closeTime
    ) {
      j++;
    }
    const label =
      i === j
        ? DAY_LABELS[i]
        : `${DAY_LABELS[i]}–${DAY_LABELS[j]}`;
    groups.push({ label, open: d.openTime, close: d.closeTime });
    i = j + 1;
  }
  return groups
    .map((g) => `${g.label} ${formatTime12h(g.open)}–${formatTime12h(g.close)}`)
    .join(", ");
}
