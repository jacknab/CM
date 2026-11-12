import { salonTimeZone } from "@/lib/salonClock";

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "2 years ago" — in the salon's time zone. */
export function sinceVisit(visitAt: Date, now = new Date(), timeZone = salonTimeZone()): string {
  const day = (d: Date) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); return Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1, +p.slice(8, 10)); };
  const days = Math.round((day(now) - day(visitAt)) / 86_400_000);
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"} ago`;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return n(days, "day");
  if (days < 35) return n(Math.floor(days / 7), "week");
  if (days < 365) return n(Math.max(1, Math.floor(days / 30.44)), "month");
  return n(Math.floor(days / 365.25), "year");
}
