const iso = (date: Date) => date.toISOString().slice(0, 10);

export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export interface PayrollPeriod {
  periodStart: string;
  periodEnd: string;
  payDate: string;
}

/** `value` moved by whole months, keeping its day of the month (the 31st → the month's last day, without drifting). */
function addMonthsClamped(value: string, months: number): string {
  const [y, m, d] = value.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return iso(target);
}

/** The half of the month (1st–15th or 16th–last) holding `day`, moved by `halves`. */
function halfMonth(day: string, halves: number): { start: string; end: string } {
  const [y, m, d] = day.split("-").map(Number);
  const index = (y * 12 + (m - 1)) * 2 + (d <= 15 ? 0 : 1) + halves;
  const month = Math.floor(index / 2), second = index % 2 === 1;
  const yy = Math.floor(month / 12), mm = month % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return second
    ? { start: `${yy}-${pad(mm + 1)}-16`, end: `${yy}-${pad(mm + 1)}-${pad(last)}` }
    : { start: `${yy}-${pad(mm + 1)}-01`, end: `${yy}-${pad(mm + 1)}-15` };
}

/**
 * The k-th pay period counted from the configured first pay date (k = 0 is the period that pay date pays;
 * negative k are earlier ones). Each pay date pays a period that ended `offsetDays` before it.
 *  - weekly / biweekly: pay dates every 7 / 14 days from the first one;
 *  - monthly: the same day of every month (the 31st falls back to a shorter month's last day, without drifting);
 *    each period runs from the day after the previous one ended;
 *  - semimonthly: the 1st–15th and the 16th–end of each month, each paid `offsetDays` after it ends
 *    (owner audit 2026-10-24: these used to be 15-day steps, which drifted off the calendar).
 */
export function payrollPeriodAt(frequency: string, anchorPayDate: string, offsetDays: number, k: number): PayrollPeriod {
  if (frequency === "semimonthly") {
    const half = halfMonth(addCalendarDays(anchorPayDate, -offsetDays), k);
    return { periodStart: half.start, periodEnd: half.end, payDate: addCalendarDays(half.end, offsetDays) };
  }
  if (frequency === "monthly") {
    const payDate = addMonthsClamped(anchorPayDate, k);
    const periodEnd = addCalendarDays(payDate, -offsetDays);
    const periodStart = addCalendarDays(addCalendarDays(addMonthsClamped(anchorPayDate, k - 1), -offsetDays), 1);
    return { periodStart, periodEnd, payDate };
  }
  const step = frequency === "biweekly" ? 14 : 7;
  const payDate = addCalendarDays(anchorPayDate, k * step);
  const periodEnd = addCalendarDays(payDate, -offsetDays);
  return { periodStart: addCalendarDays(periodEnd, -(step - 1)), periodEnd, payDate };
}

/** The index of the newest period that has closed (ended before `today`). */
function newestClosedIndex(frequency: string, anchorPayDate: string, offsetDays: number, today: string): number {
  let k = 0, guard = 0;
  while (payrollPeriodAt(frequency, anchorPayDate, offsetDays, k).periodEnd >= today && guard++ < 2000) k--;
  while (payrollPeriodAt(frequency, anchorPayDate, offsetDays, k + 1).periodEnd < today && guard++ < 4000) k++;
  return k;
}

/** Closed periods aligned to the configured pay date, newest first, including when that first pay date is in the future. */
export function payrollPeriodsDue(
  frequency: string,
  anchorPayDate: string,
  periodEndOffsetDays: number,
  today: string,
  cap = 12,
): PayrollPeriod[] {
  const newest = newestClosedIndex(frequency, anchorPayDate, periodEndOffsetDays, today);
  const periods: PayrollPeriod[] = [];
  for (let k = newest; periods.length < cap; k--) periods.push(payrollPeriodAt(frequency, anchorPayDate, periodEndOffsetDays, k));
  return periods;
}

/** Start of the fourth business day after period close; the first three remain editable. */
export function autoApprovalDate(periodEnd: string): string {
  let date = periodEnd;
  let businessDays = 0;
  while (businessDays < 4) {
    date = addCalendarDays(date, 1);
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) businessDays++;
  }
  return date;
}


/** The pay period that is still open today (the one after the newest closed period). */
export function currentPayrollPeriod(frequency: string, anchorPayDate: string, periodEndOffsetDays: number, today: string): PayrollPeriod {
  return payrollPeriodAt(frequency, anchorPayDate, periodEndOffsetDays, newestClosedIndex(frequency, anchorPayDate, periodEndOffsetDays, today) + 1);
}
