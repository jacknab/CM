const iso = (date: Date) => date.toISOString().slice(0, 10);

export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function addCalendarMonths(value: string, months: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return iso(date);
}

export interface PayrollPeriod {
  periodStart: string;
  periodEnd: string;
  payDate: string;
}

function movePayDate(value: string, frequency: string, direction: 1 | -1): string {
  if (frequency === "monthly") return addCalendarMonths(value, direction);
  if (frequency === "semimonthly") return addCalendarDays(value, 15 * direction);
  return addCalendarDays(value, (frequency === "biweekly" ? 14 : 7) * direction);
}

function periodForPayDate(frequency: string, payDate: string, offsetDays: number): PayrollPeriod {
  const periodEnd = addCalendarDays(payDate, -offsetDays);
  const periodStart = frequency === "monthly"
    ? addCalendarDays(addCalendarMonths(periodEnd, -1), 1)
    : addCalendarDays(periodEnd, -(frequency === "semimonthly" ? 14 : frequency === "biweekly" ? 13 : 6));
  return { periodStart, periodEnd, payDate };
}

/** Closed periods aligned to the configured pay date, including when that first pay date is in the future. */
export function payrollPeriodsDue(
  frequency: string,
  anchorPayDate: string,
  periodEndOffsetDays: number,
  today: string,
  cap = 12,
): PayrollPeriod[] {
  let payDate = anchorPayDate;
  let guard = 0;

  // Move backward until this pay date belongs to a period that has actually closed.
  while (periodForPayDate(frequency, payDate, periodEndOffsetDays).periodEnd >= today && guard++ < 600) {
    payDate = movePayDate(payDate, frequency, -1);
  }
  // If an old anchor was configured, move forward to the newest closed period.
  while (guard++ < 1200) {
    const next = movePayDate(payDate, frequency, 1);
    if (periodForPayDate(frequency, next, periodEndOffsetDays).periodEnd >= today) break;
    payDate = next;
  }

  const periods: PayrollPeriod[] = [];
  while (periods.length < cap && guard++ < 1800) {
    const period = periodForPayDate(frequency, payDate, periodEndOffsetDays);
    if (period.periodEnd < today) periods.push(period);
    payDate = movePayDate(payDate, frequency, -1);
  }
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
  const newest = payrollPeriodsDue(frequency, anchorPayDate, periodEndOffsetDays, today, 1)[0];
  if (!newest) return periodForPayDate(frequency, anchorPayDate, periodEndOffsetDays);
  return periodForPayDate(frequency, movePayDate(newest.payDate, frequency, 1), periodEndOffsetDays);
}
