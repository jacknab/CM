/**
 * The time printed on receipts and check-in slips (owner, 2026-11-02). The Android app formats the printed time on
 * the tablet, in the tablet's own time zone — on the salon's tablets that is UTC, so a receipt printed at 2:44 AM
 * read 10:44 AM. The page knows the salon's time zone, so it sends the salon's clock time with no zone attached
 * ("2026-11-02T02:44:05"): the app reads that as local time and prints it exactly.
 */
let salonTimeZone_: string | null = null;

/** The salon's time zone for showing times (undefined = this tablet's own): the tablets' own clock zone can differ
 *  from the salon's (store 2's are on Central time, the salon on Arizona time), and every time read an hour off. */
export function salonTimeZone(): string | undefined {
  return salonTimeZone_ ?? undefined;
}

/** Set by whatever knows the salon (the signed-in store, the kiosk / customer screen's salon settings). */
export function setSalonTimeZone(tz: string | null | undefined): void {
  if (tz) salonTimeZone_ = tz;
}

/** Now, as the salon's wall clock, for a printed slip. Without a known salon time zone: this tablet's clock. */
export function salonNowForPrint(now: Date = new Date(), tz: string | null = salonTimeZone_): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (tz) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      }).formatToParts(now).map((p) => [p.type, p.value]));
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    } catch { /* unknown zone: this tablet's clock */ }
  }
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
