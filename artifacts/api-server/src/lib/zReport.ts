import { and, eq, gte, lt, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  appointments, staff, services, serviceCategories, addons, appointmentAddons,
  giftCards, loyaltyTransactions, paymentRefunds, businessHours, registers,
  type CashDrawerSessionWithActions,
} from "@shared/schema";
import { commissionBasis, commissionAmount } from "@shared/commissionBasis";
import { r2 } from "@shared/nailCheckout";
import { getLocalDateString, getLocalDayUtcRange } from "./businessDay";
import { allocateTenders } from "./tenderAllocation";
import { cashBelongsToDrawer, primaryDrawerId } from "./stationDrawer";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Same convention already used by /api/staff/me/income for splitting a ticket's tip into
// "cash tip" vs "card tip" (a ticket's tip isn't itself tendered separately, so it's classified
// by how the ticket as a whole was paid) — extended to also match nail POS's compound
// "cash:20.00,card:15.50" payment-method strings, which that older endpoint doesn't produce/expect.
function isCashTip(paymentMethod: string | null): boolean {
  const m = (paymentMethod ?? "").toLowerCase();
  return m.includes("cash");
}

export interface ApptRow {
  id: number;
  staffId: number | null;
  serviceId: number | null;
  status: string | null;
  date: Date;
  totalPaid: string | null;
  tipAmount: string | null;
  discountAmount: string | null;
  servicePrice: string | null;
  serviceRevenue: string | null;
  productRevenue: string | null;
  commissionRate: string | null;
  paymentMethod: string | null;
}

export interface AggInput {
  rows: ApptRow[];
  staffById: Map<number, { name: string; commissionRate: number; productCommissionRate: number; commissionEnabled: boolean }>;
  categoryByServiceId: Map<number, string>;
  addonRevByAppt: Map<number, number>;
  svcPriceById: Map<number, number>;
  /** What each ticket kept per tender method (allocateTenders); computed from `rows` when omitted. */
  tendersById?: Map<number, Record<string, number>>;
}

export function aggregate({ rows, staffById, categoryByServiceId, addonRevByAppt, svcPriceById, tendersById }: AggInput) {
  const completed = rows.filter((a) => a.status === "completed" && num(a.totalPaid) > 0);
  const tenders = tendersById ?? allocateTenders(completed);

  let grossSales = 0, discounts = 0, tips = 0, totalPaidSum = 0, cashTips = 0, cardTips = 0;
  const paymentBreakdown: Record<string, number> = {};
  const categoryRevenue: Record<string, number> = {};
  let addonRevenueTotal = 0;

  const staffAgg = new Map<number, { serviceRevenue: number; productRevenue: number; tickets: number; tips: number; serviceCommission: number; productCommission: number }>();

  for (const a of completed) {
    const paid = num(a.totalPaid);
    const tip = num(a.tipAmount);
    const disc = num(a.discountAmount);
    grossSales += paid + disc - tip;
    discounts += disc;
    tips += tip;
    totalPaidSum += paid;

    if (isCashTip(a.paymentMethod)) cashTips += tip; else cardTips += tip;

    for (const [method, amt] of Object.entries(tenders.get(a.id) ?? { card: paid })) {
      paymentBreakdown[method] = r2((paymentBreakdown[method] || 0) + amt);
    }

    // Commission basis — the one rule in @shared/commissionBasis: services + add-ons at the
    // frozen service rate, retail products at the (unsnapshotted, current) product rate.
    const basis = commissionBasis(a, {
      catalogPrice: a.serviceId ? svcPriceById.get(a.serviceId) ?? 0 : 0,
      addonTotal: addonRevByAppt.get(a.id) ?? 0,
    });
    const addonRev = addonRevByAppt.get(a.id) ?? 0;
    addonRevenueTotal += addonRev;

    const category = a.serviceId ? categoryByServiceId.get(a.serviceId) ?? "Uncategorized" : "Uncategorized";
    categoryRevenue[category] = (categoryRevenue[category] || 0) + Math.max(0, basis.service - addonRev);

    if (a.staffId != null) {
      const sMeta = staffById.get(a.staffId);
      const svcRatePct = sMeta?.commissionEnabled ? (a.commissionRate != null ? num(a.commissionRate) : sMeta.commissionRate) : 0;
      const prodRatePct = sMeta?.commissionEnabled ? (sMeta.productCommissionRate ?? 0) : 0;
      const amt = commissionAmount(basis, svcRatePct, prodRatePct);

      const cur = staffAgg.get(a.staffId) ?? { serviceRevenue: 0, productRevenue: 0, tickets: 0, tips: 0, serviceCommission: 0, productCommission: 0 };
      cur.serviceRevenue += basis.service;
      cur.productRevenue += basis.product;
      cur.tickets += 1;
      cur.tips += tip;
      cur.serviceCommission += amt.service;
      cur.productCommission += amt.product;
      staffAgg.set(a.staffId, cur);
    }
  }

  const netSales = r2(grossSales - discounts);
  const tickets = completed.length;

  return {
    grossSales: r2(grossSales),
    discounts: r2(discounts),
    netSales,
    totalCollected: r2(totalPaidSum),
    totalPaidSum: r2(totalPaidSum),
    tips: r2(tips),
    cashTips: r2(cashTips),
    cardTips: r2(cardTips),
    tickets,
    avgTicket: tickets > 0 ? r2(netSales / tickets) : 0,
    paymentBreakdown,
    categoryRevenue,
    addonRevenueTotal: r2(addonRevenueTotal),
    staffAgg,
  };
}

export interface ZReportOptions {
  storeId: number;
  timezone: string;
  salonName: string;
  registerName: string | null;
  session: CashDrawerSessionWithActions;
}

export async function computeZReport(opts: ZReportOptions) {
  const { storeId, timezone, salonName, registerName, session } = opts;

  // "Today" on this report is the drawer session itself: from when it opened to when it closed
  // (or now, for a preview). Everything that went through the drawer in that window is what the
  // cash count has to match — including a close run after midnight or a day or two late — and
  // consecutive sessions never count the same sale twice. A sale belongs to the session in
  // which it was checked out, not the time its appointment was scheduled.
  const shiftStart = new Date(session.openedAt);
  const shiftEnd = session.closedAt ? new Date(session.closedAt) : new Date();
  const inShift = (d: Date | string | null | undefined) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= shiftStart.getTime() && t <= shiftEnd.getTime();
  };
  const businessDate = getLocalDateString(timezone, shiftEnd);
  const year = businessDate.slice(0, 4);
  const ytdRange = getLocalDayUtcRange(`${year}-01-01`, timezone);
  // YTD runs to the end of this session, and always includes the whole session even if it
  // opened last year.
  const rangeStart = new Date(Math.min(ytdRange.start.getTime(), shiftStart.getTime()));
  const rangeEnd = new Date(shiftEnd.getTime() + 1);

  const [apptRowsRaw, staffRows, svcRows, catRows, refundRows, giftCardRows, loyaltyRows, hoursRow, registerRow] = await Promise.all([
    db.select({
      id: appointments.id, staffId: appointments.staffId, serviceId: appointments.serviceId,
      status: appointments.status, date: sql<Date>`COALESCE(${appointments.completedAt}, ${appointments.date})`, totalPaid: appointments.totalPaid,
      tipAmount: appointments.tipAmount, discountAmount: appointments.discountAmount,
      servicePrice: appointments.servicePrice, serviceRevenue: appointments.serviceRevenue,
      productRevenue: appointments.productRevenue, commissionRate: appointments.commissionRate,
      paymentMethod: appointments.paymentMethod, cashDrawerId: appointments.cashDrawerId,
    }).from(appointments).where(and(eq(appointments.storeId, storeId), gte(sql<Date>`COALESCE(${appointments.completedAt}, ${appointments.date})`, rangeStart), lt(sql<Date>`COALESCE(${appointments.completedAt}, ${appointments.date})`, rangeEnd))),
    db.select().from(staff).where(eq(staff.storeId, storeId)),
    db.select({ id: services.id, price: services.price, categoryId: services.categoryId }).from(services).where(eq(services.storeId, storeId)),
    db.select({ id: serviceCategories.id, name: serviceCategories.name }).from(serviceCategories).where(eq(serviceCategories.storeId, storeId)),
    db.select().from(paymentRefunds).where(and(eq(paymentRefunds.storeId, storeId), gte(paymentRefunds.createdAt, rangeStart), lt(paymentRefunds.createdAt, rangeEnd))),
    db.select().from(giftCards).where(and(eq(giftCards.storeId, storeId), gte(giftCards.createdAt, rangeStart), lt(giftCards.createdAt, rangeEnd))),
    db.select().from(loyaltyTransactions).where(and(eq(loyaltyTransactions.storeId, storeId), gte(loyaltyTransactions.createdAt, rangeStart), lt(loyaltyTransactions.createdAt, rangeEnd))),
    db.select().from(businessHours).where(eq(businessHours.storeId, storeId)),
    db.select().from(registers).where(and(eq(registers.storeId, storeId), eq(registers.isDefault, true))).limit(1),
  ]);

  // The checkout time above is a computed SQL column, which the database driver hands back as text, not
  // as a Date. Everything below (and the tender allocation) needs a real Date — leaving it as text made
  // every Day Close fail once a shift held two tickets paid with itemised tenders ("m2:1.15,cash:125.85").
  const apptRows = apptRowsRaw.map((a) => ({ ...a, date: new Date(a.date as unknown as string | Date) }));

  // Business-hours day-of-week must be computed from the SALON's local calendar date, not
  // any UTC instant near a DST/offset edge — this table only has 7 rows, so fetch them all
  // and pick the local day-of-week client-side rather than filtering in SQL.
  const localDow = new Date(`${businessDate}T12:00:00Z`).getUTCDay();
  const todaysHours = hoursRow.find((h) => h.dayOfWeek === localDow);

  const svcPriceById = new Map(svcRows.map((s) => [s.id, num(s.price)]));
  const categoryById = new Map(catRows.map((c) => [c.id, c.name]));
  const categoryByServiceId = new Map<number, string>();
  for (const s of svcRows) {
    categoryByServiceId.set(s.id, s.categoryId != null ? (categoryById.get(s.categoryId) ?? "Uncategorized") : "Uncategorized");
  }

  const apptIds = apptRows.map((a) => a.id);
  const addonRevByAppt = new Map<number, number>();
  if (apptIds.length) {
    const rows = await db
      .select({ appointmentId: appointmentAddons.appointmentId, price: addons.price })
      .from(appointmentAddons)
      .leftJoin(addons, eq(appointmentAddons.addonId, addons.id))
      .where(inArray(appointmentAddons.appointmentId, apptIds));
    for (const r of rows) addonRevByAppt.set(r.appointmentId, (addonRevByAppt.get(r.appointmentId) ?? 0) + num(r.price));
  }

  const staffById = new Map(
    staffRows.map((s) => [s.id, {
      name: s.name,
      commissionRate: num(s.commissionRate),
      productCommissionRate: num((s as any).productCommissionRate),
      commissionEnabled: !!s.commissionEnabled,
    }]),
  );

  // One allocation over every row, so a group payment is split the same way in both views.
  const tendersById = allocateTenders(apptRows.filter((a) => a.status === "completed" && num(a.totalPaid) > 0));
  const aggInput = { staffById, categoryByServiceId, addonRevByAppt, svcPriceById, tendersById };
  const todayRows = apptRows.filter((a) => inShift(a.date));
  const today = aggregate({ rows: todayRows, ...aggInput });
  const ytd = aggregate({ rows: apptRows, ...aggInput });

  // ── Refunds ──────────────────────────────────────────────────────────────
  const refundsToday = r2(refundRows.filter((r) => inShift(r.createdAt)).reduce((s, r) => s + r.amountCents / 100, 0));
  const refundsYtd = r2(refundRows.reduce((s, r) => s + r.amountCents / 100, 0));
  // Stripe-issued refunds never touch the physical cash drawer.
  const cashRefundsToday = 0;

  // ── Gift cards (sold = new cards issued; redeemed = the "gift" tender bucket, the
  // actually-written signal — see computeZReport's caller-facing notes) ──────────────
  const giftSoldToday = r2(giftCardRows.filter((g) => inShift(g.createdAt)).reduce((s, g) => s + num(g.originalAmount), 0));
  const giftSoldYtd = r2(giftCardRows.reduce((s, g) => s + num(g.originalAmount), 0));
  const giftRedeemedToday = r2(today.paymentBreakdown["gift"] || 0);
  const giftRedeemedYtd = r2(ytd.paymentBreakdown["gift"] || 0);
  const hasGiftCardActivity = giftSoldYtd > 0 || giftRedeemedYtd > 0;

  // ── Loyalty ──────────────────────────────────────────────────────────────
  const loyaltyEarned = (rows: typeof loyaltyRows) => rows.filter((t) => (t.type === "earn" || t.type === "bonus") && t.points > 0).reduce((s, t) => s + t.points, 0);
  const loyaltyRedeemed = (rows: typeof loyaltyRows) => rows.filter((t) => t.type === "redeem").reduce((s, t) => s + Math.abs(t.points), 0);
  const rewardValue = (rows: typeof loyaltyRows) => rows
    .filter((t) => t.type === "redeem" && t.description)
    .reduce((s, t) => {
      const m = /\$([\d.]+)\s*off/i.exec(t.description || "");
      return s + (m ? Number(m[1]) : 0);
    }, 0);
  const todayLoyalty = loyaltyRows.filter((t) => inShift(t.createdAt));
  const hasLoyaltyActivity = loyaltyRows.length > 0;

  // ── Transaction summary (today only) ────────────────────────────────────
  const refundedAppointmentIdsToday = new Set(refundRows.filter((r) => inShift(r.createdAt) && r.appointmentId != null).map((r) => r.appointmentId));
  const noShowToday = todayRows.filter((a) => a.status === "no_show" || a.status === "no-show").length;

  // ── Salon Earnings — "Net Service Revenue" here is the same refund-adjusted Net Sales
  // figure shown in the Financial Summary, not the pre-refund aggregate total. ──────────
  const netSalesTodayAdj = r2(today.netSales - refundsToday);
  const netSalesYtdAdj = r2(ytd.netSales - refundsYtd);
  const commissionTodayTotal = r2([...today.staffAgg.values()].reduce((s, v) => s + v.serviceCommission + v.productCommission, 0));
  const commissionYtdTotal = r2([...ytd.staffAgg.values()].reduce((s, v) => s + v.serviceCommission + v.productCommission, 0));
  const salonEarningsToday = r2(netSalesTodayAdj - commissionTodayTotal);
  const salonEarningsYtd = r2(netSalesYtdAdj - commissionYtdTotal);

  let openHour: { businessOpen: string | null; totalOpenHours: number | null; salonEarningsPerOpenHour: number | null } = {
    businessOpen: null, totalOpenHours: null, salonEarningsPerOpenHour: null,
  };
  if (todaysHours && !todaysHours.isClosed) {
    const [oh, om] = todaysHours.openTime.split(":").map(Number);
    const [ch, cm] = todaysHours.closeTime.split(":").map(Number);
    const openMinutes = oh * 60 + om;
    const closeMinutes = ch * 60 + cm;
    const totalOpenHours = r2(Math.max(0, closeMinutes - openMinutes) / 60);
    if (totalOpenHours > 0) {
      openHour = {
        businessOpen: `${todaysHours.openTime} – ${todaysHours.closeTime}`,
        totalOpenHours,
        salonEarningsPerOpenHour: r2(salonEarningsToday / totalOpenHours),
      };
    }
  }

  // ── Technician commissions table ────────────────────────────────────────
  const technicianCommissions = [...today.staffAgg.entries()]
    .filter(([, v]) => v.serviceRevenue > 0 || v.productRevenue > 0)
    .map(([staffId, v]) => {
      const name = staffById.get(staffId)?.name ?? `Staff #${staffId}`;
      const commissionToday = r2(v.serviceCommission + v.productCommission);
      const effectiveRatePct = v.serviceRevenue > 0 ? r2((v.serviceCommission / v.serviceRevenue) * 100) : num(staffById.get(staffId)?.commissionRate);
      const ytdAgg = ytd.staffAgg.get(staffId);
      const commissionYtd = ytdAgg ? r2(ytdAgg.serviceCommission + ytdAgg.productCommission) : 0;
      return {
        staffId, name, ratePct: effectiveRatePct,
        serviceRevenueToday: r2(v.serviceRevenue), productRevenueToday: r2(v.productRevenue),
        commissionToday, commissionYtd,
      };
    })
    .sort((a, b) => b.commissionToday - a.commissionToday);

  // ── Technician sales summary (today only, separate from commission calc) ──
  const technicianSales = [...today.staffAgg.entries()]
    .filter(([, v]) => v.tickets > 0)
    .map(([staffId, v]) => ({
      staffId, name: staffById.get(staffId)?.name ?? `Staff #${staffId}`,
      tickets: v.tickets, serviceRevenue: r2(v.serviceRevenue), tips: r2(v.tips),
    }))
    .sort((a, b) => b.serviceRevenue - a.serviceRevenue);

  // ── Cash drawer reconciliation — every paid-in/out recorded against this session ──
  const actionsToday = session.actions || [];
  const cashIn = r2(actionsToday.filter((a) => a.type === "cash_in" || a.type === "paid_in").reduce((s, a) => s + num(a.amount), 0));
  const cashOut = r2(actionsToday.filter((a) => a.type === "cash_out" || a.type === "paid_out").reduce((s, a) => s + num(a.amount), 0));
  const openingCash = num(session.openingBalance);
  // The drawer's own cash (2026-10-29): a salon with a drawer per POS station counts each drawer's sales at its own
  // Day Close; cash no station claimed goes to the main drawer. Everything else on the report is salon-wide.
  const sessionDrawerId = (session as any).drawerId ?? null;
  const primaryId = sessionDrawerId != null ? await primaryDrawerId(storeId) : null;
  const cashSalesToday = sessionDrawerId == null ? r2(today.paymentBreakdown["cash"] || 0)
    : r2(todayRows.filter((a) => cashBelongsToDrawer(a.cashDrawerId, sessionDrawerId, primaryId))
      .reduce((sum, a) => sum + (tendersById.get(a.id)?.cash ?? 0), 0));
  const expectedCash = r2(openingCash + cashSalesToday - cashRefundsToday + cashIn - cashOut);
  const actualCashCounted = session.closingBalance != null ? num(session.closingBalance) : null;
  const variance = actualCashCounted != null ? r2(actualCashCounted - expectedCash) : null;
  const cashDeposit = r2(Math.max(0, cashSalesToday - cashRefundsToday + cashIn - cashOut));

  return {
    // The native (certxa-owner) receipt layout heads the slip "DAY CLOSED" or "PREVIEW - NOT YET CLOSED"
    // from this — it used to be missing, so every printed Z Report said "not yet closed".
    dayClosed: session.closedAt != null,
    header: {
      salonName,
      businessDate,
      timezone,
      closedAt: session.closedAt ?? null,
      closedBy: session.closedBy ?? null,
      registerName: registerName ?? registerRow[0]?.name ?? null,
    },
    financialSummary: {
      today: { grossSales: today.grossSales, discounts: today.discounts, refunds: refundsToday, netSales: r2(today.netSales - refundsToday), salesTax: 0, totalCollected: r2(today.totalPaidSum - refundsToday), tips: today.tips, tickets: today.tickets, avgTicket: today.avgTicket },
      ytd: { grossSales: ytd.grossSales, discounts: ytd.discounts, refunds: refundsYtd, netSales: r2(ytd.netSales - refundsYtd), salesTax: 0, totalCollected: r2(ytd.totalPaidSum - refundsYtd), tips: ytd.tips, tickets: ytd.tickets, avgTicket: ytd.avgTicket },
    },
    paymentSummary: { today: today.paymentBreakdown, ytd: ytd.paymentBreakdown },
    cashDrawer: {
      openingCash: r2(openingCash), cashSales: cashSalesToday, cashRefunds: cashRefundsToday,
      cashPaidIn: cashIn, cashPaidOut: cashOut, expectedCash, actualCashCounted, variance, cashDeposit,
    },
    serviceSales: { today: today.categoryRevenue, ytd: ytd.categoryRevenue },
    technicianCommissions,
    technicianCommissionTotals: {
      serviceRevenueToday: r2([...today.staffAgg.values()].reduce((s, v) => s + v.serviceRevenue, 0)),
      commissionToday: commissionTodayTotal,
      commissionYtd: commissionYtdTotal,
    },
    tips: { today: { total: today.tips, cash: today.cashTips, card: today.cardTips }, ytd: { total: ytd.tips, cash: ytd.cashTips, card: ytd.cardTips } },
    adjustments: { discounts: { today: today.discounts, ytd: ytd.discounts }, refunds: { today: refundsToday, ytd: refundsYtd } },
    giftCards: hasGiftCardActivity ? { today: { sold: giftSoldToday, redeemed: giftRedeemedToday }, ytd: { sold: giftSoldYtd, redeemed: giftRedeemedYtd } } : null,
    loyalty: hasLoyaltyActivity ? {
      today: { earned: loyaltyEarned(todayLoyalty), redeemed: loyaltyRedeemed(todayLoyalty), rewardValueRedeemed: r2(rewardValue(todayLoyalty)) },
      ytd: { earned: loyaltyEarned(loyaltyRows), redeemed: loyaltyRedeemed(loyaltyRows), rewardValueRedeemed: r2(rewardValue(loyaltyRows)) },
    } : null,
    technicianSales,
    transactionSummary: {
      completed: today.tickets,
      refunded: refundedAppointmentIdsToday.size,
      noShow: noShowToday,
      total: today.tickets + noShowToday,
    },
    salonEarnings: {
      today: { netServiceRevenue: netSalesTodayAdj, technicianCommissions: commissionTodayTotal, salonEarnings: salonEarningsToday },
      ytd: { netServiceRevenue: netSalesYtdAdj, technicianCommissions: commissionYtdTotal, salonEarnings: salonEarningsYtd },
      openHour,
    },
  };
}
