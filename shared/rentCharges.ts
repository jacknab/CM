import type { RentFrequency } from "./rentalAgreements";

/**
 * Certxa Rentals — Rent Charge status & billing-period logic (Phase 5).
 *
 * Same pattern as shared/rentalAgreements.ts: only a minimal set of values
 * is ever persisted (`unpaid | paid | voided`); everything else the owner
 * sees (Upcoming/Due/Overdue) is derived from status + dueDate at read time,
 * never stored, so it can't drift out of sync with reality.
 */

export const CHARGE_STATUSES = ["unpaid", "paid", "voided"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const CHARGE_DISPLAY_STATES = ["upcoming", "due", "overdue", "paid", "voided"] as const;
export type ChargeDisplayState = (typeof CHARGE_DISPLAY_STATES)[number];

export const CHARGE_DISPLAY_LABELS: Record<ChargeDisplayState, string> = {
  upcoming: "Upcoming",
  due: "Due",
  overdue: "Overdue",
  paid: "Paid",
  voided: "Voided",
};

export const CHARGE_DISPLAY_DESCRIPTIONS: Record<ChargeDisplayState, string> = {
  upcoming: "Not due yet.",
  due: "Due today.",
  overdue: "Past its due date and not yet paid.",
  paid: "Fully paid.",
  voided: "Voided — not owed.",
};

export interface ChargeLifecycleInput {
  status: string;
  dueDate: Date | string;
}

/** `today` must be facility-local midnight expressed as a UTC Date (see lib/timezone.ts) — never server wall-clock. */
export function deriveChargeDisplayState(charge: ChargeLifecycleInput, today: Date): ChargeDisplayState {
  if (charge.status === "voided") return "voided";
  if (charge.status === "paid") return "paid";
  const due = new Date(charge.dueDate);
  if (due.getTime() > today.getTime()) return "upcoming";
  if (due.getTime() < today.getTime()) return "overdue";
  return "due";
}

// ─── Exact-cents money math (Section 29: never use floating point for money) ─

export function toCents(amount: string | number): number {
  const str = typeof amount === "number" ? amount.toFixed(2) : amount;
  const negative = str.trim().startsWith("-");
  const [wholeRaw, fracRaw = ""] = str.replace("-", "").split(".");
  const whole = parseInt(wholeRaw || "0", 10);
  const frac = parseInt((fracRaw + "00").slice(0, 2), 10);
  const cents = whole * 100 + frac;
  return negative ? -cents : cents;
}

export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// ─── Billing period generation ──────────────────────────────────────────────
// Pure calendar-date-string math (YYYY-MM-DD) — deliberately never converts
// to a real timezone-aware timestamp here. Adding "7 days" or "1 month" to a
// calendar date is unambiguous; adding it to a UTC instant is NOT (a week
// spanning a DST transition isn't exactly 168 hours). The caller converts
// the resulting date keys to real facility-UTC timestamps exactly once, via
// lib/timezone.ts, at the boundary — see routes/rentals.ts.

export interface BillingPeriod {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD, inclusive
  dueDate: string; // YYYY-MM-DD — rent is due at the start of its period
}

function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m - 1, d };
}

function toDateKey(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = parseDateKey(key);
  return toDateKey(y, m, d + days);
}

function addMonthToKey(key: string): string {
  const { y, m, d } = parseDateKey(key);
  // Clamp to the target month's last day rather than letting it overflow
  // into the month after (e.g. Jan 31 -> Feb 28, not Mar 2/3) — the standard
  // convention for monthly billing anchored to a day-of-month not every
  // month has. Without this, a monthly agreement starting on the 29th-31st
  // would drift its billing date forward by a few days every single month.
  const targetMonthLastDay = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return toDateKey(y, m + 1, Math.min(d, targetMonthLastDay));
}

function addPeriodToKey(key: string, frequency: RentFrequency): string {
  if (frequency === "weekly") return addDaysToKey(key, 7);
  if (frequency === "biweekly") return addDaysToKey(key, 14);
  return addMonthToKey(key);
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The Nth monthly anchor from an original (year, 0-indexed month, day),
 * re-clamping fresh to each target month's length every time rather than
 * compounding a previous clamp. Without this, an agreement anchored on the
 * 31st would clamp to Feb 28 and then — if each period were computed from
 * the previous one — permanently stay anchored at the 28th every month after
 * that, even in 31-day months. Re-deriving from the original day each time
 * means March correctly gets the 31st back.
 */
function nthMonthAnchor(year: number, month0: number, day: number, n: number): string {
  const totalMonths = month0 + n;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth0 = ((totalMonths % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth0 + 1, 0)).getUTCDate();
  return toDateKey(targetYear, targetMonth0, Math.min(day, lastDayOfTargetMonth));
}

/**
 * All billing periods for an agreement from its start date through one
 * period past `todayKey` (so the owner always has visibility into the next
 * upcoming charge, not just the current one), capped at the agreement's
 * effective end (terminatedAt ?? endDate ?? — null means open-ended, so no
 * cap). A guard against runaway iteration (~19 years of weekly billing, or
 * 1000 months) is a sanity cap, not a real limitation.
 */
export function computeBillingPeriods(params: {
  startDateKey: string;
  effectiveEndDateKey: string | null;
  frequency: RentFrequency;
  todayKey: string;
}): BillingPeriod[] {
  const { startDateKey, effectiveEndDateKey, frequency, todayKey } = params;
  if (compareKeys(startDateKey, todayKey) > 0) return []; // hasn't started yet — nothing to bill

  const horizonKey = addPeriodToKey(todayKey, frequency);
  const stopKey = effectiveEndDateKey && compareKeys(effectiveEndDateKey, horizonKey) < 0 ? effectiveEndDateKey : horizonKey;

  const periods: BillingPeriod[] = [];

  if (frequency === "monthly") {
    const { y, m, d } = parseDateKey(startDateKey);
    for (let n = 0; n < 1000; n++) {
      const periodStart = nthMonthAnchor(y, m, d, n);
      if (compareKeys(periodStart, stopKey) > 0) break;
      const periodEnd = addDaysToKey(nthMonthAnchor(y, m, d, n + 1), -1);
      periods.push({ periodStart, periodEnd, dueDate: periodStart });
    }
    return periods;
  }

  const stepDays = frequency === "weekly" ? 7 : 14;
  let cursor = startDateKey;
  let guard = 0;
  while (compareKeys(cursor, stopKey) <= 0 && guard < 1000) {
    guard++;
    const nextStart = addDaysToKey(cursor, stepDays);
    const periodEnd = addDaysToKey(nextStart, -1);
    periods.push({ periodStart: cursor, periodEnd, dueDate: cursor });
    cursor = nextStart;
  }
  return periods;
}
