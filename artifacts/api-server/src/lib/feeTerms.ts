/**
 * Cancellation / no-show fee terms saved on each online booking (owner, 2026-11-07).
 *
 * When a client books online, the shop's policy at that moment (fee %, cancellation window, policy text, and when
 * the client ticked "I agree") is copied onto the appointment, with the fee in cents worked out from the booking's
 * price. Charging a fee later (the pro's button in the Certxa Pro app, or a late online cancel) uses only these
 * saved terms, so changing the policy never changes what an already-booked client pays.
 */
import { pool } from "../db";

export type FeeTerms = {
  percent: number | null;
  cutoffHours: number | null;
  policyText: string | null;
  acceptedAt: string | null;
};

/** The shop's terms right now. `accepted` = the client ticked the policy box on this booking. */
export async function currentFeeTerms(storeId: number, accepted: boolean): Promise<FeeTerms> {
  const r = await pool.query(
    `SELECT cancellation_fee_value::float8 AS pct, cancellation_hours_cutoff AS cutoff, cancellation_policy_text AS text
       FROM locations WHERE id = $1`, [storeId]);
  const row = r.rows[0] ?? {};
  const pct = Number(row.pct) || 0;
  const text = String(row.text ?? "").trim();
  return {
    percent: pct > 0 ? pct : null,
    cutoffHours: row.cutoff != null ? Number(row.cutoff) : null,
    policyText: text || null,
    acceptedAt: accepted && text ? new Date().toISOString() : null,
  };
}

/** The terms a booking request was sent with (null for requests sent before terms were saved). */
export async function requestFeeTerms(requestId: number): Promise<FeeTerms | null> {
  const r = await pool.query(`SELECT fee_terms FROM booking_requests WHERE id = $1`, [requestId]);
  const t = r.rows[0]?.fee_terms;
  return t && typeof t === "object" ? (t as FeeTerms) : null;
}

/** Copy the terms onto the appointment; the fee is a share of the booking's price (travel fee not included). */
export async function saveFeeTerms(appointmentId: number, terms: FeeTerms, visitCents: number): Promise<void> {
  const feeCents = terms.percent ? Math.round(Math.max(0, visitCents) * terms.percent / 100) : null;
  await pool.query(
    `UPDATE appointments SET fee_terms_at = now(), fee_percent_agreed = $2, fee_cents_agreed = $3,
            fee_cutoff_hours_agreed = $4, policy_text_agreed = $5, policy_accepted_at = $6
      WHERE id = $1`,
    [appointmentId, terms.percent, feeCents, terms.cutoffHours, terms.policyText, terms.acceptedAt]);
}

export type AgreedFee = {
  /** true when the booking has saved terms (online bookings from 2026-11-07). */
  saved: boolean;
  percent: number;
  /** The fee in cents: the saved amount, else (older bookings) null and the caller works it out from the live %. */
  cents: number | null;
  cutoffHours: number | null;
};

/** What may be charged for this booking: its saved terms, else the shop's live % (older and staff-made bookings). */
export async function agreedFee(appointmentId: number): Promise<AgreedFee | null> {
  const r = await pool.query(
    `SELECT a.fee_terms_at, a.fee_percent_agreed::float8 AS pct_agreed, a.fee_cents_agreed, a.fee_cutoff_hours_agreed,
            l.cancellation_fee_value::float8 AS pct_live, l.cancellation_hours_cutoff AS cutoff_live
       FROM appointments a JOIN locations l ON l.id = a.store_id WHERE a.id = $1`, [appointmentId]);
  const row = r.rows[0];
  if (!row) return null;
  if (row.fee_terms_at) {
    return { saved: true, percent: Number(row.pct_agreed) || 0, cents: row.fee_cents_agreed != null ? Number(row.fee_cents_agreed) : 0,
      cutoffHours: row.fee_cutoff_hours_agreed != null ? Number(row.fee_cutoff_hours_agreed) : null };
  }
  return { saved: false, percent: Number(row.pct_live) || 0, cents: null, cutoffHours: row.cutoff_live != null ? Number(row.cutoff_live) : null };
}
