import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { appointments } from "@shared/schema";
import { storage } from "../storage";
import type { BusinessDay, BusinessDayWithActions } from "@shared/schema";

/**
 * Returns the salon-local calendar date (YYYY-MM-DD) for "now", using the
 * store's own timezone — never server/UTC time. This is the single source of
 * truth for which Business Day a given moment belongs to.
 */
export function getLocalDateString(timezone: string, at: Date = new Date()): string {
  return formatInTimeZone(at, timezone, "yyyy-MM-dd");
}

/**
 * Returns the [start, end) UTC instants that correspond to local midnight-to-midnight
 * for the given local date string in the given timezone. Used to bound sales queries
 * to exactly one Business Day regardless of DST or server timezone.
 */
export function getLocalDayUtcRange(dateStr: string, timezone: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${dateStr}T00:00:00`, timezone);
  const nextDay = toZonedTime(start, timezone);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDateStr = formatInTimeZone(nextDay, timezone, "yyyy-MM-dd");
  const end = fromZonedTime(`${nextDateStr}T00:00:00`, timezone);
  return { start, end };
}

/**
 * Get-or-create the Business Day shell for "today" (salon local date). This is the
 * lazy equivalent of the spec's "create a record shell at 12:00 AM salon local time" —
 * rather than running a per-timezone midnight cron, we create the row on first access
 * for that date, which is idempotent and naturally resilient to missed closures /
 * multi-day gaps (a store that was closed for days just gets the shell created when
 * someone next opens the drawer).
 */
export async function getOrCreateTodayBusinessDay(storeId: number, timezone: string): Promise<BusinessDayWithActions> {
  const today = getLocalDateString(timezone);
  const existing = await storage.getBusinessDayByDate(storeId, today);
  if (existing) return existing;

  await storage.createBusinessDay({
    storeId,
    date: today,
    status: "not_started",
    openingFloat: null,
  } as any);

  const created = await storage.getBusinessDayByDate(storeId, today);
  if (!created) throw new Error("Failed to create Business Day shell");
  return created;
}

/**
 * Finds the most recent Business Day strictly before `beforeDate` that has not
 * been reconciled. This is what drives Overlay Type A ("yesterday needs to be
 * reconciled") — it survives arbitrary gaps (forgotten closures, multi-day
 * closures) because it always looks for the last unreconciled day, not a
 * specific calendar date.
 */
export async function getPendingReconciliation(storeId: number, beforeDate: string): Promise<BusinessDayWithActions | undefined> {
  const pending = await storage.getLatestUnreconciledBusinessDay(storeId, beforeDate);
  if (!pending) return undefined;

  // The local calendar date has moved on past this day, but it was left OPEN
  // (register never explicitly closed) — reflect that in the state machine so
  // the audit trail and UI both show PENDING_RECONCILIATION rather than a
  // stale OPEN status for a day that's already over.
  if (pending.status === "open") {
    await storage.updateBusinessDay(pending.id, { status: "pending_reconciliation" });
    return { ...pending, status: "pending_reconciliation" };
  }

  return pending;
}

/**
 * Aggregates cash/card sales, tips, and cash in/out register actions for a
 * Business Day from completed appointments within its local calendar date,
 * plus its own audit action log — mirroring the existing Z-report logic but
 * scoped to a full calendar day instead of a drawer-session window.
 */
export async function computeBusinessDayTotals(day: BusinessDayWithActions, timezone: string) {
  const { start, end } = getLocalDayUtcRange(day.date, timezone);

  const dayAppointments = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.storeId, day.storeId),
      gte(appointments.date, start),
      lt(appointments.date, end),
    ));

  const completed = dayAppointments.filter(a => a.status === "completed" && a.totalPaid);

  let cashSales = 0;
  let cardSales = 0;
  let tips = 0;

  for (const apt of completed) {
    const paid = Number(apt.totalPaid) || 0;
    const tip = Number(apt.tipAmount) || 0;
    tips += tip;

    if (apt.paymentMethod) {
      const parts = apt.paymentMethod.split(",");
      for (const part of parts) {
        const [method, amtStr] = part.split(":");
        const amt = Number(amtStr) || paid;
        const key = method.trim().toLowerCase();
        if (key === "cash") cashSales += amt;
        else cardSales += amt;
      }
    } else {
      cardSales += paid;
    }
  }

  let cashIn = 0;
  let cashOut = 0;
  for (const action of day.actions || []) {
    if (action.type === "cash_in") cashIn += Number(action.amount) || 0;
    else if (action.type === "cash_out") cashOut += Number(action.amount) || 0;
  }

  const openingFloat = Number(day.openingFloat) || 0;
  const expectedCash = openingFloat + cashSales + cashIn - cashOut;

  return {
    cashSales: Math.round(cashSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    tips: Math.round(tips * 100) / 100,
    cashIn: Math.round(cashIn * 100) / 100,
    cashOut: Math.round(cashOut * 100) / 100,
    expectedCash: Math.round(expectedCash * 100) / 100,
    transactionCount: completed.length,
  };
}
