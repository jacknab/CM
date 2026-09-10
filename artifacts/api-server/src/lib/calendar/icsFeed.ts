/**
 * One-way iCalendar (.ics) subscription feed.
 *
 * The salon owner (or a technician) subscribes to a URL in Apple Calendar /
 * Google Calendar / Outlook and their Certxa bookings show up automatically,
 * refreshed by the calendar app every ~15 min – few hours. Read-only, no OAuth.
 *
 * The feed ref embeds the scope and is HMAC-signed with SESSION_SECRET, so the
 * URL is unguessable and needs no database row. Rotating SESSION_SECRET
 * invalidates every outstanding link.
 */

import crypto from "crypto";

const SECRET = () => process.env.SESSION_SECRET ?? process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "certxa-ics";

function sign(scope: string): string {
  return crypto.createHmac("sha256", SECRET()).update(scope).digest("base64url").slice(0, 24);
}

/** Build the `<scope>-<sig>` ref that goes in the feed URL. */
export function feedRef(storeId: number, staffId?: number | null): string {
  const scope = staffId ? `s${storeId}t${staffId}` : `s${storeId}`;
  return `${scope}-${sign(scope)}`;
}

/** Parse + verify a feed ref. Returns null on any mismatch. */
export function parseFeedRef(ref: string): { storeId: number; staffId: number | null } | null {
  const cleaned = String(ref).replace(/\.ics$/i, "");
  const dash = cleaned.lastIndexOf("-");
  if (dash < 1) return null;
  const scope = cleaned.slice(0, dash);
  const sig = cleaned.slice(dash + 1);

  const expected = sign(scope);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  const m = scope.match(/^s(\d+)(?:t(\d+))?$/);
  if (!m) return null;
  return { storeId: Number(m[1]), staffId: m[2] ? Number(m[2]) : null };
}

export function feedUrl(storeId: number, staffId?: number | null): string {
  const base = (process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "");
  return `${base}/api/calendar-sync/feed/${feedRef(storeId, staffId)}.ics`;
}

// ── iCalendar document ─────────────────────────────────────────────────────
export interface FeedEvent {
  id: number;
  start: Date;
  durationMin: number;
  summary: string;
  description?: string;
  location?: string;
  cancelled?: boolean;
}

function fold(line: string): string {
  // RFC 5545: lines SHOULD be ≤75 octets; continuations start with a space.
  if (line.length <= 74) return line;
  const out: string[] = [];
  let s = line;
  out.push(s.slice(0, 74));
  s = s.slice(74);
  while (s.length) {
    out.push(" " + s.slice(0, 73));
    s = s.slice(73);
  }
  return out.join("\r\n");
}

function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fmtUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(calName: string, events: FeedEvent[]): string {
  const now = fmtUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Certxa//Booking Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(calName)}`),
    "X-PUBLISHED-TTL:PT30M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
  ];

  for (const e of events) {
    const end = new Date(e.start.getTime() + Math.max(1, e.durationMin) * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:appt-${e.id}@certxa.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${fmtUtc(e.start)}`,
      `DTEND:${fmtUtc(end)}`,
      fold(`SUMMARY:${esc(e.summary)}`),
      ...(e.description ? [fold(`DESCRIPTION:${esc(e.description)}`)] : []),
      ...(e.location ? [fold(`LOCATION:${esc(e.location)}`)] : []),
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
