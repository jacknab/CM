/**
 * Client reports (owner, 2026-10-29, plans/reports.md stage 3). A visit is a finished appointment (several tickets of one
 * visit count once); a client's spend is what they paid less tips.
 */
import { pool } from "../../db";
import { AT_RISK_DAYS } from "@shared/clientStatus";
import { previousRange, storeTimezone, type ReportRange } from "./money";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const PAID = `COALESCE(a.completed_at, a.date)`;

/** Retention: new vs returning clients, and how many new clients came back within 30 / 60 / 90 days. */
export async function retentionReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const one = async (p: ReportRange) => (await pool.query(
    `WITH firsts AS (
       SELECT a.customer_id, MIN(${PAID}) AS first_at FROM appointments a
        WHERE a.store_id = $1 AND a.status = 'completed' AND a.customer_id IS NOT NULL GROUP BY a.customer_id),
     served AS (
       SELECT DISTINCT a.customer_id FROM appointments a
        WHERE a.store_id = $1 AND a.status = 'completed' AND a.customer_id IS NOT NULL
          AND (${PAID} AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date),
     fresh AS (
       SELECT f.customer_id, f.first_at FROM firsts f
        WHERE (f.first_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
     SELECT (SELECT COUNT(*) FROM served)::int AS served,
            (SELECT COUNT(*) FROM fresh)::int AS new_clients,
            (SELECT COUNT(*) FROM fresh f WHERE EXISTS (SELECT 1 FROM appointments n WHERE n.store_id = $1 AND n.customer_id = f.customer_id
               AND n.status = 'completed' AND COALESCE(n.completed_at, n.date) > f.first_at + interval '2 hours'))::int AS back_any,
            ${[30, 60, 90].map((d) => `(SELECT COUNT(*) FROM fresh f WHERE EXISTS (SELECT 1 FROM appointments n WHERE n.store_id = $1 AND n.customer_id = f.customer_id
               AND n.status = 'completed' AND COALESCE(n.completed_at, n.date) > f.first_at + interval '2 hours'
               AND COALESCE(n.completed_at, n.date) <= f.first_at + interval '${d} days'))::int AS back${d},
            (SELECT COUNT(*) FROM fresh f WHERE f.first_at <= now() - interval '${d} days')::int AS old${d}`).join(",\n")}`,
    [storeId, tz, p.from, p.to])).rows[0];
  const x = await one(r);
  const rate = (back: number, old: number) => (old ? Math.round((back / old) * 100) : null);
  const totals = {
    served: x.served, newClients: x.new_clients, returning: Math.max(0, x.served - x.new_clients),
    // Of the new clients who have had that long to come back.
    back30: rate(x.back30, x.old30), back60: rate(x.back60, x.old60), back90: rate(x.back90, x.old90),
    // Of all the period's new clients, however recent: how many have been back so far.
    backSoFar: rate(x.back_any, x.new_clients),
  };
  const avgGap = (await pool.query(
    `SELECT AVG(gap) AS days FROM (
       SELECT EXTRACT(EPOCH FROM (${PAID} - LAG(${PAID}) OVER (PARTITION BY a.customer_id ORDER BY ${PAID}))) / 86400 AS gap
         FROM appointments a WHERE a.store_id = $1 AND a.status = 'completed' AND a.customer_id IS NOT NULL) g
     WHERE gap > 0.5`, [storeId])).rows[0];
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await one(p); previous = { range: p, served: y.served, newClients: y.new_clients }; }
  return { range: r, totals: { ...totals, avgDaysBetweenVisits: avgGap?.days != null ? Math.round(num(avgGap.days)) : null }, previous };
}

/** Lapsed clients: clients who have visited but haven't been back for a while (default AT_RISK_DAYS, shared/clientStatus.ts) — a list to win back. */
export async function lapsedReport(storeId: number, r: ReportRange, _compare: boolean, q: Record<string, unknown> = {}) {
  const days = Math.min(365, Math.max(14, Number(q.days) || AT_RISK_DAYS));
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name AS name,
            (SELECT COALESCE(p.display_phone, p.phone_number_e164) FROM client_phones p WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) AS phone,
            COUNT(DISTINCT COALESCE(a.ticket_group_id, a.id))::int AS visits, MAX(${PAID}) AS last_visit,
            COALESCE(SUM(a.total_paid - COALESCE(a.tip_amount, 0)), 0) AS spend,
            (SELECT st.name FROM appointments b JOIN staff st ON st.id = b.staff_id WHERE b.customer_id = c.id AND b.status = 'completed'
              GROUP BY st.name ORDER BY COUNT(*) DESC LIMIT 1) AS usual_tech
       FROM clients c JOIN appointments a ON a.customer_id = c.id AND a.store_id = $1 AND a.status = 'completed'
      WHERE c.archived_at IS NULL
      GROUP BY c.id, c.full_name
     HAVING MAX(${PAID}) < ($2::date - ($3 || ' days')::interval)
      ORDER BY spend DESC LIMIT 200`,
    [storeId, r.to, days],
  );
  return {
    range: r, days,
    clients: rows.map((x: any) => ({ id: x.id, name: x.name, phone: x.phone, visits: x.visits, lastVisit: x.last_visit, spend: r2(num(x.spend)), usualTech: x.usual_tech })),
  };
}

/** Top clients: who spent the most in the period, and their lifetime value. */
export async function topClientsReport(storeId: number, r: ReportRange, _compare: boolean) {
  const tz = await storeTimezone(storeId);
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name AS name, COALESCE(c.loyalty_points, 0) AS points,
            COUNT(DISTINCT COALESCE(a.ticket_group_id, a.id))::int AS visits,
            COALESCE(SUM(a.total_paid - COALESCE(a.tip_amount, 0)), 0) AS spend, MAX(${PAID}) AS last_visit,
            (SELECT COALESCE(SUM(b.total_paid - COALESCE(b.tip_amount, 0)), 0) FROM appointments b WHERE b.customer_id = c.id AND b.store_id = $1 AND b.status = 'completed') AS lifetime
       FROM clients c JOIN appointments a ON a.customer_id = c.id AND a.store_id = $1 AND a.status = 'completed'
        AND (${PAID} AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY c.id, c.full_name, c.loyalty_points ORDER BY spend DESC LIMIT 50`,
    [storeId, tz, r.from, r.to],
  );
  return { range: r, clients: rows.map((x: any) => ({ id: x.id, name: x.name, visits: x.visits, spend: r2(num(x.spend)), avgTicket: x.visits ? r2(num(x.spend) / x.visits) : 0,
    lastVisit: x.last_visit, lifetime: r2(num(x.lifetime)), points: Number(x.points) || 0 })) };
}

/** No-shows & cancellations: how often booked visits don't happen, on which days, and which clients do it repeatedly. */
export async function noShowsReport(storeId: number, r: ReportRange, compare: boolean) {
  const tz = await storeTimezone(storeId);
  const counts = async (p: ReportRange) => (await pool.query(
    `SELECT COUNT(*)::int AS booked,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
       FROM appointments WHERE store_id = $1 AND (date AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`,
    [storeId, tz, p.from, p.to])).rows[0];
  const t = await counts(r);
  const byDay = (await pool.query(
    `SELECT EXTRACT(DOW FROM date AT TIME ZONE $2)::int AS dow, COUNT(*)::int AS booked,
            COUNT(*) FILTER (WHERE status IN ('cancelled','no_show'))::int AS missed
       FROM appointments WHERE store_id = $1 AND (date AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date GROUP BY 1 ORDER BY 1`,
    [storeId, tz, r.from, r.to])).rows;
  const repeat = (await pool.query(
    `SELECT c.id, c.full_name AS name, COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
            COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled, COUNT(*)::int AS booked
       FROM appointments a JOIN clients c ON c.id = a.customer_id
      WHERE a.store_id = $1 AND (a.date AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY c.id, c.full_name HAVING COUNT(*) FILTER (WHERE a.status IN ('no_show','cancelled')) >= 2
      ORDER BY 3 DESC, 4 DESC LIMIT 50`,
    [storeId, tz, r.from, r.to])).rows;
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  let previous = null;
  if (compare) { const p = previousRange(r); const y = await counts(p); previous = { range: p, noShowRate: rate(y.no_shows, y.booked), cancelRate: rate(y.cancelled, y.booked) }; }
  return {
    range: r,
    totals: { ...t, noShowRate: rate(t.no_shows, t.booked), cancelRate: rate(t.cancelled, t.booked) },
    byDay: byDay.map((x: any) => ({ dow: x.dow, booked: x.booked, missed: x.missed, rate: rate(x.missed, x.booked) })),
    clients: repeat, previous,
  };
}

/** Loyalty: points clients earned and used, and who holds the most. */
export async function loyaltyReport(storeId: number, r: ReportRange, _compare: boolean) {
  const tz = await storeTimezone(storeId);
  const t = (await pool.query(
    `SELECT COALESCE(SUM(points) FILTER (WHERE type = 'earn'), 0)::int AS earned,
            COALESCE(-SUM(points) FILTER (WHERE type = 'redeem'), 0)::int AS redeemed,
            COUNT(*) FILTER (WHERE type = 'redeem')::int AS redemptions,
            COUNT(DISTINCT customer_id) FILTER (WHERE type = 'earn')::int AS earners
       FROM loyalty_transactions WHERE store_id = $1 AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`,
    [storeId, tz, r.from, r.to])).rows[0];
  const holders = (await pool.query(
    `SELECT id, full_name AS name, loyalty_points AS points FROM clients WHERE store_id = $1 AND loyalty_points > 0 ORDER BY loyalty_points DESC LIMIT 25`,
    [storeId])).rows;
  const balance = (await pool.query(`SELECT COALESCE(SUM(loyalty_points), 0)::int AS points, COUNT(*) FILTER (WHERE loyalty_points > 0)::int AS members FROM clients WHERE store_id = $1`, [storeId])).rows[0];
  return { range: r, totals: { ...t, outstanding: balance.points, members: balance.members }, holders };
}

export const CLIENT_REPORTS = { retention: retentionReport, lapsed: lapsedReport, top: topClientsReport, "no-shows": noShowsReport, loyalty: loyaltyReport } as const;
