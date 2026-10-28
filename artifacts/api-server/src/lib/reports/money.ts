/**
 * Money reports (owner, 2026-10-29: each report its own page, worked out on the server from what was actually charged).
 *
 * A sale belongs to the day it was checked out (completed_at; its booked time when there is none), in the salon's own
 * timezone. A ticket's money is what the checkout froze on it: service_revenue + product_revenue (before discount, tax
 * and tip), discount_amount, tax_amount (migration 0269), tip_amount, total_paid. A visit of several tickets
 * (ticket_group_id) is one visit. Payment methods come from tenderAllocation (split payments split correctly).
 */
import { pool } from "../../db";
import { allocateTenders } from "../tenderAllocation";

export interface ReportRange { from: string; to: string }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function parseRange(q: { from?: unknown; to?: unknown }): ReportRange | null {
  const from = String(q.from ?? ""), to = String(q.to ?? "");
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || from > to) return null;
  // At most ~3 years in one report.
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 1100) return null;
  return { from, to };
}

/** The period just before, of the same length (for "compared with"). */
export function previousRange(r: ReportRange): ReportRange {
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  const end = new Date(Date.parse(r.from) - 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return { from: d(start), to: d(end) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;

export async function storeTimezone(storeId: number): Promise<string> {
  const { rows } = await pool.query(`SELECT timezone FROM locations WHERE id = $1`, [storeId]);
  return rows[0]?.timezone || "UTC";
}

interface SaleRow {
  id: number; visit: number; day: string; dow: number; hour: number; staffId: number | null; staffName: string | null;
  services: number; products: number; discount: number; tax: number; tip: number; total: number;
  paymentMethod: string | null; date: Date; totalPaid: string | null;
}

/** Completed sales in the range, with their money. */
async function sales(storeId: number, tz: string, r: ReportRange): Promise<SaleRow[]> {
  const { rows } = await pool.query(
    `SELECT a.id, COALESCE(a.ticket_group_id, a.id) AS visit,
            to_char((COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day,
            EXTRACT(DOW FROM COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::int AS dow,
            EXTRACT(HOUR FROM COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::int AS hour,
            a.staff_id, st.name AS staff_name,
            a.service_revenue, a.product_revenue, a.discount_amount, a.tax_amount, a.tip_amount, a.total_paid,
            a.payment_method, COALESCE(a.completed_at, a.date) AS paid_at
       FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id
      WHERE a.store_id = $1 AND a.status = 'completed'
        AND (COALESCE(a.completed_at, a.date) AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`,
    [storeId, tz, r.from, r.to],
  );
  return rows.map((x: any) => {
    const total = num(x.total_paid), tip = num(x.tip_amount), discount = num(x.discount_amount);
    const tax = x.tax_amount != null ? num(x.tax_amount) : 0;
    // A sale from before the checkout froze its split (no service_revenue): what it paid, less tip and tax.
    const services = x.service_revenue != null ? num(x.service_revenue) : Math.max(0, total - tip - tax + discount);
    return {
      id: Number(x.id), visit: Number(x.visit), day: x.day, dow: Number(x.dow), hour: Number(x.hour),
      staffId: x.staff_id != null ? Number(x.staff_id) : null, staffName: x.staff_name ?? null,
      services, products: num(x.product_revenue), discount, tax, tip, total,
      paymentMethod: x.payment_method ?? null, date: new Date(x.paid_at), totalPaid: x.total_paid,
    };
  });
}

/** Days in the range, or months when it is longer than ~3 months (for the chart). */
function buckets(r: ReportRange): { key: (day: string) => string; labels: string[]; by: "day" | "month" } {
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  if (days <= 93) {
    const labels: string[] = [];
    for (let t = Date.parse(r.from); t <= Date.parse(r.to); t += 86_400_000) labels.push(new Date(t).toISOString().slice(0, 10));
    return { key: (d) => d, labels, by: "day" };
  }
  const labels: string[] = [];
  const end = r.to.slice(0, 7);
  for (let [y, m] = r.from.slice(0, 7).split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= end; m === 12 ? (y++, m = 1) : m++) {
    labels.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return { key: (d) => d.slice(0, 7), labels, by: "month" };
}

function salesTotals(rows: SaleRow[], refunds: number) {
  const services = r2(rows.reduce((s, x) => s + x.services, 0));
  const products = r2(rows.reduce((s, x) => s + x.products, 0));
  const discounts = r2(rows.reduce((s, x) => s + x.discount, 0));
  const visits = new Set(rows.map((x) => x.visit)).size;
  const netSales = r2(services + products - discounts);
  return {
    visits, tickets: rows.length, services, products, gross: r2(services + products), discounts, netSales,
    tax: r2(rows.reduce((s, x) => s + x.tax, 0)), tips: r2(rows.reduce((s, x) => s + x.tip, 0)),
    collected: r2(rows.reduce((s, x) => s + x.total, 0)), refunds, afterRefunds: r2(netSales - refunds),
    avgTicket: visits ? r2(netSales / visits) : 0,
  };
}

async function refundsIn(storeId: number, tz: string, r: ReportRange): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM payment_refunds
      WHERE store_id = $1 AND status IN ('succeeded', 'pending')
        AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`, [storeId, tz, r.from, r.to]);
  return r2(num(rows[0]?.cents) / 100);
}

/** Sales: the totals, a day/month chart, and when in the week the money comes in. */
export async function salesReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const rows = await sales(storeId, tz, r);
  const totals = salesTotals(rows, await refundsIn(storeId, tz, r));
  const b = buckets(r);
  const series = b.labels.map((label) => {
    const inIt = rows.filter((x) => b.key(x.day) === label);
    return { label, netSales: r2(inIt.reduce((s, x) => s + x.services + x.products - x.discount, 0)), visits: new Set(inIt.map((x) => x.visit)).size };
  });
  // Weekday × hour: where the net sales fall.
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const x of rows) heat[x.dow][x.hour] = r2(heat[x.dow][x.hour] + x.services + x.products - x.discount);
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    previous = { range: p, totals: salesTotals(await sales(storeId, tz, p), await refundsIn(storeId, tz, p)) };
  }
  return { range: r, by: b.by, totals, series, heat, previous };
}

function tenderTotals(rows: SaleRow[]) {
  const shares = allocateTenders(rows.map((x) => ({ id: x.id, totalPaid: x.totalPaid, paymentMethod: x.paymentMethod, date: x.date })) as any);
  const byMethod = new Map<string, { amount: number; count: number }>();
  for (const x of rows) {
    for (const [method, amt] of Object.entries(shares.get(x.id) ?? {})) {
      const m = byMethod.get(method) ?? { amount: 0, count: 0 };
      m.amount = r2(m.amount + amt); m.count += 1;
      byMethod.set(method, m);
    }
  }
  return { shares, byMethod };
}

/** Payments: how the money was taken — cash, card, M2, tap, gift card — split payments split correctly. */
export async function paymentsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const rows = await sales(storeId, tz, r);
  const { shares, byMethod } = tenderTotals(rows);
  const total = r2([...byMethod.values()].reduce((s, m) => s + m.amount, 0));
  const methods = [...byMethod.entries()].map(([method, m]) => ({ method, amount: m.amount, count: m.count, share: total ? r2((m.amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  const b = buckets(r);
  const series = b.labels.map((label) => {
    const out: Record<string, number> = {};
    for (const x of rows.filter((y) => b.key(y.day) === label)) for (const [method, amt] of Object.entries(shares.get(x.id) ?? {})) out[method] = r2((out[method] ?? 0) + amt);
    return { label, ...out };
  });
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    const prev = tenderTotals(await sales(storeId, tz, p));
    previous = { range: p, total: r2([...prev.byMethod.values()].reduce((s, m) => s + m.amount, 0)),
      methods: Object.fromEntries([...prev.byMethod.entries()].map(([k, v]) => [k, v.amount])) };
  }
  return { range: r, by: b.by, total, methods, series, previous };
}

/** Sales tax: the tax actually charged, by day/month, with the sales it was charged on. */
export async function taxReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const rows = await sales(storeId, tz, r);
  const b = buckets(r);
  const series = b.labels.map((label) => {
    const inIt = rows.filter((x) => b.key(x.day) === label);
    return { label, tax: r2(inIt.reduce((s, x) => s + x.tax, 0)), netSales: r2(inIt.reduce((s, x) => s + x.services + x.products - x.discount, 0)),
      taxedSales: r2(inIt.filter((x) => x.tax > 0).reduce((s, x) => s + x.services + x.products - x.discount, 0)) };
  });
  const totals = {
    tax: r2(rows.reduce((s, x) => s + x.tax, 0)),
    netSales: r2(rows.reduce((s, x) => s + x.services + x.products - x.discount, 0)),
    taxedSales: r2(rows.filter((x) => x.tax > 0).reduce((s, x) => s + x.services + x.products - x.discount, 0)),
    taxedTickets: rows.filter((x) => x.tax > 0).length, tickets: rows.length,
  };
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    const prev = await sales(storeId, tz, p);
    previous = { range: p, tax: r2(prev.reduce((s, x) => s + x.tax, 0)) };
  }
  return { range: r, by: b.by, totals, series, previous };
}

/** Tips: by technician — how much, on how many tickets, and as a share of their sales. */
export async function tipsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const rows = await sales(storeId, tz, r);
  const by = new Map<string, { staffId: number | null; name: string; tips: number; tickets: number; tipped: number; sales: number }>();
  for (const x of rows) {
    const k = String(x.staffId ?? "none");
    const e = by.get(k) ?? { staffId: x.staffId, name: x.staffName ?? "No technician", tips: 0, tickets: 0, tipped: 0, sales: 0 };
    e.tips = r2(e.tips + x.tip); e.tickets += 1; if (x.tip > 0) e.tipped += 1; e.sales = r2(e.sales + x.services + x.products - x.discount);
    by.set(k, e);
  }
  const staff = [...by.values()].map((e) => ({ ...e, avgTip: e.tipped ? r2(e.tips / e.tipped) : 0, tipRate: e.sales ? r2((e.tips / e.sales) * 100) : 0 }))
    .sort((a, b) => b.tips - a.tips);
  const tips = r2(rows.reduce((s, x) => s + x.tip, 0));
  const salesTotal = r2(rows.reduce((s, x) => s + x.services + x.products - x.discount, 0));
  const b = buckets(r);
  const series = b.labels.map((label) => ({ label, tips: r2(rows.filter((x) => b.key(x.day) === label).reduce((s, x) => s + x.tip, 0)) }));
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    previous = { range: p, tips: r2((await sales(storeId, tz, p)).reduce((s, x) => s + x.tip, 0)) };
  }
  return { range: r, by: b.by, totals: { tips, tickets: rows.length, tipped: rows.filter((x) => x.tip > 0).length, tipRate: salesTotal ? r2((tips / salesTotal) * 100) : 0 }, staff, series, previous };
}

/** Gift cards: sold and redeemed in the period, and what is still owed on cards out there (a liability). */
export async function giftCardsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const soldIn = async (p: ReportRange) => (await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(original_amount), 0) AS amount FROM gift_cards
      WHERE store_id = $1 AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`, [storeId, tz, p.from, p.to])).rows[0];
  const sold = await soldIn(r);
  const { shares } = tenderTotals(await sales(storeId, tz, r));
  const redeemed = r2([...shares.values()].reduce((s, m) => s + (m.gift ?? 0), 0));
  const outstanding = (await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(remaining_balance), 0) AS amount FROM gift_cards
      WHERE store_id = $1 AND COALESCE(is_active, true) AND remaining_balance > 0 AND (expires_at IS NULL OR expires_at > now())`, [storeId])).rows[0];
  const cards = (await pool.query(
    `SELECT code, original_amount, remaining_balance, issued_to_name, created_at FROM gift_cards
      WHERE store_id = $1 AND COALESCE(is_active, true) AND remaining_balance > 0 ORDER BY remaining_balance DESC LIMIT 50`, [storeId])).rows
    .map((c: any) => ({ code: `…${String(c.code).slice(-4)}`, original: num(c.original_amount), balance: num(c.remaining_balance), name: c.issued_to_name ?? null, createdAt: c.created_at }));
  let previous = null;
  if (compare) {
    const p = previousRange(r);
    const ps = await soldIn(p);
    previous = { range: p, soldAmount: r2(num(ps.amount)), soldCount: Number(ps.n) || 0 };
  }
  return {
    range: r,
    totals: { soldCount: Number(sold.n) || 0, soldAmount: r2(num(sold.amount)), redeemed, outstandingCount: Number(outstanding.n) || 0, outstanding: r2(num(outstanding.amount)) },
    cards, previous,
  };
}

export const MONEY_REPORTS = { sales: salesReport, payments: paymentsReport, tax: taxReport, tips: tipsReport, "gift-cards": giftCardsReport } as const;
