/**
 * Marketing reports (owner, 2026-10-29, plans/reports.md stage 5): review requests, the texts the salon sent, and Autumn's
 * calls. sms_log.sent_at and ai_call_log.started_at are stored as UTC without a zone.
 */
import { pool } from "../../db";
import { previousRange, storeTimezone, type ReportRange } from "./money";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const LOCAL_DAY = (col: string) => `((${col} AT TIME ZONE 'UTC') AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`;

/** Review requests: texts sent, how many clients opened the review link, and the reviews that came in. */
export async function reviewsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const one = async (p: ReportRange) => (await pool.query(
    `SELECT (SELECT COUNT(*) FROM sms_log WHERE store_id = $1 AND message_type = 'review_request' AND status = 'sent' AND ${LOCAL_DAY("sent_at")})::int AS sent,
            (SELECT COUNT(*) FROM sms_log WHERE store_id = $1 AND message_type = 'review_request' AND status <> 'sent' AND ${LOCAL_DAY("sent_at")})::int AS not_sent,
            (SELECT COUNT(*) FROM review_tokens WHERE store_id = $1 AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)::int AS links,
            (SELECT COUNT(*) FROM review_tokens WHERE store_id = $1 AND used_at IS NOT NULL AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)::int AS opened,
            (SELECT COUNT(*) FROM reviews WHERE store_id = $1 AND ${LOCAL_DAY("created_at")})::int AS reviews,
            (SELECT AVG(rating) FROM reviews WHERE store_id = $1 AND ${LOCAL_DAY("created_at")}) AS rating,
            (SELECT COUNT(*) FROM review_submissions WHERE store_id = $1 AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)::int AS private_feedback`,
    [storeId, tz, p.from, p.to])).rows[0];
  const x = await one(r);
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await one(p); previous = { range: p, sent: y.sent, opened: y.opened, reviews: y.reviews }; }
  return {
    range: r,
    totals: { sent: x.sent, notSent: x.not_sent, links: x.links, opened: x.opened, openRate: x.links ? Math.round((x.opened / x.links) * 100) : null,
      reviews: x.reviews, rating: x.rating != null ? Math.round(num(x.rating) * 10) / 10 : null, privateFeedback: x.private_feedback },
    previous,
  };
}

/** Texts sent: every text the salon sent, by kind, with failures and the estimated cost. */
export async function textsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const byType = async (p: ReportRange) => (await pool.query(
    `SELECT message_type, COUNT(*) FILTER (WHERE status = 'sent')::int AS sent, COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE status NOT IN ('sent','failed'))::int AS skipped, COALESCE(SUM(cost_estimate) FILTER (WHERE status = 'sent'), 0) AS cost
       FROM sms_log WHERE store_id = $1 AND ${LOCAL_DAY("sent_at")} GROUP BY message_type ORDER BY 2 DESC`,
    [storeId, tz, p.from, p.to])).rows;
  const rows = await byType(r);
  const types = rows.map((x: any) => ({ type: x.message_type, sent: x.sent, failed: x.failed, skipped: x.skipped, cost: r2(num(x.cost)) }));
  const totals = { sent: types.reduce((s, x) => s + x.sent, 0), failed: types.reduce((s, x) => s + x.failed, 0), cost: r2(types.reduce((s, x) => s + x.cost, 0)) };
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await byType(p); previous = { range: p, sent: y.reduce((s: number, x: any) => s + x.sent, 0) }; }
  return { range: r, totals, types, previous };
}

/** Autumn calls: how many calls, how long, what came of them, and the visits Autumn booked. */
export async function autumnReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const one = async (p: ReportRange) => (await pool.query(
    `SELECT COUNT(*)::int AS calls, COALESCE(SUM(duration_seconds), 0)::int AS seconds,
            COUNT(*) FILTER (WHERE appointment_id IS NOT NULL OR outcome = 'booked')::int AS booked
       FROM ai_call_log WHERE store_id = $1 AND ${LOCAL_DAY("started_at")}`,
    [storeId, tz, p.from, p.to])).rows[0];
  const x = await one(r);
  const outcomes = (await pool.query(
    `SELECT COALESCE(outcome, 'unknown') AS outcome, COUNT(*)::int AS n FROM ai_call_log
      WHERE store_id = $1 AND ${LOCAL_DAY("started_at")} GROUP BY 1 ORDER BY 2 DESC`,
    [storeId, tz, r.from, r.to])).rows;
  const value = (await pool.query(
    `SELECT COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed, COALESCE(SUM(a.total_paid - COALESCE(a.tip_amount, 0)) FILTER (WHERE a.status = 'completed'), 0) AS sales
       FROM ai_call_log l JOIN appointments a ON a.id = l.appointment_id
      WHERE l.store_id = $1 AND ${LOCAL_DAY("l.started_at")}`,
    [storeId, tz, r.from, r.to])).rows[0];
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await one(p); previous = { range: p, calls: y.calls, booked: y.booked }; }
  return {
    range: r,
    totals: { calls: x.calls, minutes: Math.round(x.seconds / 60), avgMinutes: x.calls ? r2(x.seconds / 60 / x.calls) : 0, booked: x.booked,
      bookRate: x.calls ? Math.round((x.booked / x.calls) * 100) : null, completedVisits: value.completed, sales: r2(num(value.sales)) },
    outcomes, previous,
  };
}

export const MARKETING_REPORTS = { reviews: reviewsReport, texts: textsReport, autumn: autumnReport } as const;
