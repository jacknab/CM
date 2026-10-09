/**
 * zReportText.ts — Day Close / Z Report layout for the native ESC/POS bridge (pure, no React
 * Native imports, so it can be unit-tested like receiptText.ts).
 *
 * This app's other tickets print at COL_W = 32 (58mm paper — see receiptText.ts), not the 80mm
 * the web browser-print version of this report targets, so a literal TODAY|YTD side-by-side
 * table (which needs ~42-48 columns to stay readable) doesn't fit here. Instead every TODAY/YTD
 * metric prints as two lines — the figure that matters most in the moment (today's) on the
 * primary line, with YTD as an indented sub-line beneath it, the same visual idiom this file's
 * sibling already uses for an item's duration under its name.
 *
 * Field names/shape here deliberately mirror the backend's computeZReport() response
 * (artifacts/api-server/src/lib/zReport.ts) exactly — today/ytd grouped by TIME PERIOD, each
 * holding the same set of metric keys — the same shape the web browser-print renderer
 * (artifacts/booking/src/components/reports/ZReportPrint.tsx's buildZReportHtml) consumes, so
 * there's exactly one JSON contract for this report, not two. The web side pre-formats the two
 * header date/time strings (see ZReportHeader below) before sending this over the native
 * bridge, since this app has no date-fns-tz / store-timezone plumbing of its own.
 */

import { twoCol, divLine, fitName } from './receiptText';

const COL_W = 32;

export interface ZReportHeader {
  salonName: string;
  businessDate: string; // "September 24, 2026" — pre-formatted by the web caller
  closedLabel: string;  // "9:47 PM" or "Not yet closed" — pre-formatted by the web caller
  closedBy?: string | null;
  registerName?: string | null;
}

export interface ZReportFinancialPeriod {
  grossSales: number; discounts: number; refunds: number; netSales: number;
  salesTax: number; totalCollected: number; tips: number; tickets: number; avgTicket: number;
}

export interface ZReportCashDrawer {
  openingCash: number; cashSales: number; cashRefunds: number;
  cashPaidIn: number; cashPaidOut: number; expectedCash: number;
  actualCashCounted: number | null; variance: number | null; cashDeposit: number;
}

export interface ZReportTechCommission {
  staffId: number; name: string; ratePct: number;
  serviceRevenueToday: number; productRevenueToday: number;
  commissionToday: number; commissionYtd: number;
}
export interface ZReportTechSale {
  staffId: number; name: string; tickets: number; serviceRevenue: number; tips: number;
}

export interface ZReportPrintData {
  header: ZReportHeader;
  financialSummary: { today: ZReportFinancialPeriod; ytd: ZReportFinancialPeriod };
  paymentSummary: { today: Record<string, number>; ytd: Record<string, number> };
  cashDrawer: ZReportCashDrawer;
  serviceSales: { today: Record<string, number>; ytd: Record<string, number> };
  technicianCommissions: ZReportTechCommission[];
  technicianCommissionTotals: { serviceRevenueToday: number; commissionToday: number; commissionYtd: number };
  tips: { today: { total: number; cash: number; card: number }; ytd: { total: number; cash: number; card: number } };
  adjustments: { discounts: { today: number; ytd: number }; refunds: { today: number; ytd: number } };
  giftCards: { today: { sold: number; redeemed: number }; ytd: { sold: number; redeemed: number } } | null;
  loyalty: { today: { earned: number; redeemed: number; rewardValueRedeemed: number }; ytd: { earned: number; redeemed: number; rewardValueRedeemed: number } } | null;
  technicianSales: ZReportTechSale[];
  transactionSummary: { completed: number; refunded: number; noShow: number; total: number };
  salonEarnings: {
    today: { netServiceRevenue: number; technicianCommissions: number; salonEarnings: number };
    ytd: { netServiceRevenue: number; technicianCommissions: number; salonEarnings: number };
    openHour: { businessOpen: string | null; totalOpenHours: number | null; salonEarningsPerOpenHour: number | null };
  };
  /** Whether the underlying session has actually been closed (has a closingBalance) yet. */
  dayClosed: boolean;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Credit/Debit', credit: 'Credit/Debit', credit_card: 'Credit/Debit', debit: 'Debit',
  stripe: 'Card', m2: 'Card (M2)', tap: 'Tap to Pay', gift: 'Gift Card', check: 'Check',
  venmo: 'Venmo', zelle: 'Zelle', cashapp: 'Cash App',
};
function paymentLabel(key: string): string {
  return PAYMENT_LABELS[key.toLowerCase()] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

function $$(n: number): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-$' : '$') + abs;
}

/** TODAY on the primary line, YTD indented beneath it. Label is truncated (like an item name
 *  on the sales receipt) so an unusually long category/payment-method/tech name can never push
 *  the amount column past the printer's width. */
function metricRows(label: string, today: number, ytd: number, opts: { bold?: boolean; negate?: boolean } = {}): string[] {
  const t = opts.negate ? -today : today;
  const y = opts.negate ? -ytd : ytd;
  const priceStr = $$(t);
  const main = twoCol(fitName(label, priceStr), priceStr);
  return [
    `[L]${opts.bold ? `<b>${main}</b>` : main}`,
    `[L]  YTD ${$$(y)}`,
  ];
}

export function buildZReportText(d: ZReportPrintData): string {
  const lines: string[] = [];
  const h = d.header;

  // ── Header ───────────────────────────────────────────────────────────────
  const salonName = h.salonName.length > COL_W ? `${h.salonName.slice(0, COL_W - 1)}…` : h.salonName;
  lines.push(`[C]<b>CERTXA</b>`);
  lines.push(`[C]<b>${salonName}</b>`);
  lines.push(`[C]DAY CLOSE / Z REPORT`);
  lines.push(`[C]${divLine()}`);
  lines.push(`[L]Date: ${h.businessDate}`);
  lines.push(`[L]Closed: ${h.closedLabel}`);
  if (h.closedBy) lines.push(`[L]Closed By: ${h.closedBy}`);
  if (h.registerName) lines.push(`[L]Register: ${h.registerName}`);
  lines.push(`[C]${divLine()}`);

  // ── Financial summary ───────────────────────────────────────────────────
  const fs = d.financialSummary;
  lines.push(`[C]<b>FINANCIAL SUMMARY</b>`);
  lines.push(...metricRows('Gross Sales', fs.today.grossSales, fs.ytd.grossSales));
  lines.push(...metricRows('Discounts', fs.today.discounts, fs.ytd.discounts, { negate: true }));
  if (fs.today.refunds > 0 || fs.ytd.refunds > 0) lines.push(...metricRows('Refunds', fs.today.refunds, fs.ytd.refunds, { negate: true }));
  lines.push(...metricRows('NET SALES', fs.today.netSales, fs.ytd.netSales, { bold: true }));
  lines.push(`[L]${twoCol('Sales Tax', $$(fs.today.salesTax))}`);
  lines.push(...metricRows('TOTAL COLLECTED', fs.today.totalCollected, fs.ytd.totalCollected, { bold: true }));
  lines.push(`[L]${twoCol('Tips', $$(fs.today.tips))}`);
  lines.push(`[L]${twoCol('Tickets', String(fs.today.tickets))}`);
  lines.push(`[L]${twoCol('Avg Ticket', $$(fs.today.avgTicket))}`);
  lines.push(`[C]${divLine()}`);

  // ── Payment summary ──────────────────────────────────────────────────────
  const ps = d.paymentSummary;
  const methodKeys = Array.from(new Set([...Object.keys(ps.today), ...Object.keys(ps.ytd)]))
    .filter((k) => (ps.today[k] || 0) > 0 || (ps.ytd[k] || 0) > 0)
    .sort((a, b) => (ps.ytd[b] || 0) - (ps.ytd[a] || 0));
  lines.push(`[C]<b>PAYMENT SUMMARY</b>`);
  if (methodKeys.length === 0) {
    lines.push(`[C]No transactions.`);
  } else {
    for (const k of methodKeys) lines.push(...metricRows(paymentLabel(k), ps.today[k] || 0, ps.ytd[k] || 0));
  }
  lines.push(`[C]${divLine()}`);

  // ── Cash drawer (today only) ────────────────────────────────────────────
  const cd = d.cashDrawer;
  lines.push(`[C]<b>CASH DRAWER</b>`);
  lines.push(`[L]${twoCol('Opening Cash', $$(cd.openingCash))}`);
  lines.push(`[L]${twoCol('Cash Sales', '+' + $$(cd.cashSales))}`);
  if (cd.cashRefunds > 0) lines.push(`[L]${twoCol('Cash Refunds', $$(-cd.cashRefunds))}`);
  if (cd.cashPaidIn > 0) lines.push(`[L]${twoCol('Cash Paid In', '+' + $$(cd.cashPaidIn))}`);
  if (cd.cashPaidOut > 0) lines.push(`[L]${twoCol('Cash Paid Out', $$(-cd.cashPaidOut))}`);
  lines.push(`[L]<b>${twoCol('Expected Cash', $$(cd.expectedCash))}</b>`);
  if (cd.actualCashCounted != null) {
    lines.push(`[L]${twoCol('Actual Counted', $$(cd.actualCashCounted))}`);
  } else {
    lines.push(`[L]Actual Counted: pending`);
  }
  if (cd.variance != null) {
    lines.push(`[L]<b>${twoCol('VARIANCE', (cd.variance >= 0 ? '+' : '') + $$(cd.variance))}</b>`);
  }
  lines.push(`[L]${twoCol('Cash Deposit', $$(cd.cashDeposit))}`);
  lines.push(`[C]${divLine()}`);

  // ── Service sales by category ───────────────────────────────────────────
  const ss = d.serviceSales;
  const categoryKeys = Array.from(new Set([...Object.keys(ss.today), ...Object.keys(ss.ytd)]))
    .filter((k) => (ss.today[k] || 0) > 0 || (ss.ytd[k] || 0) > 0)
    .sort((a, b) => (ss.ytd[b] || 0) - (ss.ytd[a] || 0));
  if (categoryKeys.length > 0) {
    lines.push(`[C]<b>SERVICE SALES</b>`);
    for (const k of categoryKeys) lines.push(...metricRows(k, ss.today[k] || 0, ss.ytd[k] || 0));
    lines.push(`[C]${divLine()}`);
  }

  // ── Technician commissions ──────────────────────────────────────────────
  lines.push(`[C]<b>TECHNICIAN COMMISSIONS</b>`);
  if (d.technicianCommissions.length === 0) {
    lines.push(`[C]No commissionable revenue today.`);
  } else {
    for (const t of d.technicianCommissions) {
      const rateStr = `${t.ratePct.toFixed(0)}%`;
      lines.push(`[L]<b>${twoCol(fitName(t.name, rateStr), rateStr)}</b>`);
      lines.push(`[L]  Today ${$$(t.commissionToday)}  YTD ${$$(t.commissionYtd)}`);
    }
    lines.push(`[L]${divLine('-', 20)}`);
    lines.push(`[L]<b>${twoCol('TOTAL', $$(d.technicianCommissionTotals.commissionToday))}</b>`);
    lines.push(`[L]  YTD ${$$(d.technicianCommissionTotals.commissionYtd)}`);
  }
  lines.push(`[C]${divLine()}`);

  // ── Salon earnings ───────────────────────────────────────────────────────
  const se = d.salonEarnings;
  lines.push(`[C]<b>SALON EARNINGS</b>`);
  lines.push(...metricRows('Net Svc Revenue', se.today.netServiceRevenue, se.ytd.netServiceRevenue));
  lines.push(...metricRows('Tech Commissions', se.today.technicianCommissions, se.ytd.technicianCommissions, { negate: true }));
  lines.push(...metricRows('SALON EARNINGS', se.today.salonEarnings, se.ytd.salonEarnings, { bold: true }));
  if (se.openHour.totalOpenHours != null) {
    lines.push(`[L]Open ${se.openHour.totalOpenHours.toFixed(1)}h (${se.openHour.businessOpen})`);
    lines.push(`[L]<b>${twoCol('Per Open Hour', $$(se.openHour.salonEarningsPerOpenHour ?? 0))}</b>`);
  }
  lines.push(`[C]${divLine()}`);

  // ── Tips ─────────────────────────────────────────────────────────────────
  const tp = d.tips;
  lines.push(`[C]<b>TIPS</b>`);
  lines.push(...metricRows('Tips Collected', tp.today.total, tp.ytd.total));
  lines.push(`[L]${twoCol('Cash Tips', $$(tp.today.cash))}`);
  lines.push(`[L]${twoCol('Card Tips', $$(tp.today.card))}`);
  lines.push(`[C]${divLine()}`);

  // ── Adjustments ──────────────────────────────────────────────────────────
  lines.push(`[C]<b>ADJUSTMENTS</b>`);
  lines.push(`[L]${twoCol('Discounts', $$(-d.adjustments.discounts.today))}`);
  if (d.adjustments.refunds.today > 0) lines.push(`[L]${twoCol('Refunds', $$(-d.adjustments.refunds.today))}`);
  lines.push(`[C]${divLine()}`);

  // ── Gift cards / loyalty (only if the salon actually uses them) ────────
  if (d.giftCards) {
    lines.push(`[C]<b>GIFT CARDS</b>`);
    lines.push(`[L]${twoCol('Sold Today', $$(d.giftCards.today.sold))}`);
    lines.push(`[L]${twoCol('Redeemed Today', $$(d.giftCards.today.redeemed))}`);
    lines.push(`[L]${twoCol('YTD Sold', $$(d.giftCards.ytd.sold))}`);
    lines.push(`[L]${twoCol('YTD Redeemed', $$(d.giftCards.ytd.redeemed))}`);
    lines.push(`[C]${divLine()}`);
  }
  if (d.loyalty) {
    lines.push(`[C]<b>LOYALTY</b>`);
    lines.push(`[L]${twoCol('Points Earned', String(d.loyalty.today.earned))}`);
    lines.push(`[L]${twoCol('Points Redeemed', String(d.loyalty.today.redeemed))}`);
    if (d.loyalty.today.rewardValueRedeemed > 0) lines.push(`[L]${twoCol('Reward Value', $$(d.loyalty.today.rewardValueRedeemed))}`);
    lines.push(`[C]${divLine()}`);
  }

  // ── Technician sales (today only, separate from commission) ───────────
  if (d.technicianSales.length > 0) {
    lines.push(`[C]<b>TECHNICIAN SALES</b>`);
    for (const t of d.technicianSales) {
      const priceStr = $$(t.serviceRevenue);
      lines.push(`[L]${twoCol(fitName(t.name, priceStr), priceStr)}`);
      lines.push(`[L]  ${t.tickets} ticket${t.tickets === 1 ? '' : 's'}, ${$$(t.tips)} tips`);
    }
    lines.push(`[C]${divLine()}`);
  }

  // ── Transactions ─────────────────────────────────────────────────────────
  const tx = d.transactionSummary;
  lines.push(`[C]<b>TRANSACTIONS</b>`);
  lines.push(`[L]${twoCol('Completed', String(tx.completed))}`);
  if (tx.refunded > 0) lines.push(`[L]${twoCol('Refunded', String(tx.refunded))}`);
  if (tx.noShow > 0) lines.push(`[L]${twoCol('No-Show', String(tx.noShow))}`);
  lines.push(`[L]<b>${twoCol('Total', String(tx.total))}</b>`);
  lines.push(`[C]${divLine()}`);

  // ── Close info / footer ──────────────────────────────────────────────────
  lines.push(`[L]${twoCol('Expected Cash', $$(cd.expectedCash))}`);
  if (cd.actualCashCounted != null) lines.push(`[L]${twoCol('Actual Cash', $$(cd.actualCashCounted))}`);
  if (cd.variance != null) lines.push(`[L]${twoCol('Variance', (cd.variance >= 0 ? '+' : '') + $$(cd.variance))}`);
  lines.push(`[C]${divLine()}`);
  lines.push(`[C]<b>${d.dayClosed ? 'DAY CLOSED' : 'PREVIEW - NOT YET CLOSED'}</b>`);
  lines.push(`\n\n\n`);

  return lines.join('\n');
}
