/**
 * Booking payment-link tokens — used when the AI phone receptionist books an
 * appointment for a store that requires a deposit or card-on-file. The AI
 * can't collect a card over the phone, so the appointment is created as a
 * hidden hold (see aiReceptionist.ts / bookingEngine.ts's calendarHidden +
 * paymentStatus: "awaiting_payment") and the caller gets an SMS with a
 * one-time link to a page where they finish paying/saving a card.
 *
 * Pattern mirrors reviewLinks.ts's review_tokens table exactly (lazily
 * created via CREATE TABLE IF NOT EXISTS, called once at server startup).
 *
 * Lifecycle for a token (see services/booking-hold-scheduler.ts):
 *   created -> (20 min unpaid) resend SMS once -> (60 min unpaid) appointment
 *   + token are deleted, freeing the slot.
 */

import { pool } from "../db";
import crypto from "crypto";

export type PaymentLinkRequirement = "deposit" | "card_on_file";

const HOLD_WINDOW_MINUTES = 60;

export async function ensureBookingPaymentTokensTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_payment_tokens (
      id                   SERIAL PRIMARY KEY,
      token                TEXT NOT NULL UNIQUE,
      store_id             INTEGER NOT NULL REFERENCES locations(id),
      appointment_id       INTEGER NOT NULL REFERENCES appointments(id),
      customer_id          INTEGER,
      customer_phone       TEXT,
      requirement          TEXT NOT NULL,
      deposit_amount_cents INTEGER,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reminder_sent_at     TIMESTAMPTZ,
      expires_at           TIMESTAMPTZ NOT NULL,
      used_at              TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_booking_payment_tokens_store_id ON booking_payment_tokens(store_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_booking_payment_tokens_expiry ON booking_payment_tokens(used_at, expires_at)`);
}

export interface BookingPaymentTokenRow {
  id: number;
  token: string;
  storeId: number;
  appointmentId: number;
  customerId: number | null;
  customerPhone: string | null;
  requirement: PaymentLinkRequirement;
  depositAmountCents: number | null;
  createdAt: Date;
  reminderSentAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
}

function mapRow(row: any): BookingPaymentTokenRow {
  return {
    id: row.id,
    token: row.token,
    storeId: row.store_id,
    appointmentId: row.appointment_id,
    customerId: row.customer_id,
    customerPhone: row.customer_phone,
    requirement: row.requirement,
    depositAmountCents: row.deposit_amount_cents,
    createdAt: new Date(row.created_at),
    reminderSentAt: row.reminder_sent_at ? new Date(row.reminder_sent_at) : null,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
  };
}

export async function createBookingPaymentToken(params: {
  storeId: number;
  appointmentId: number;
  customerId: number | null;
  customerPhone: string | null;
  requirement: PaymentLinkRequirement;
  depositAmountCents: number | null;
}): Promise<BookingPaymentTokenRow> {
  const token = crypto.randomBytes(24).toString("hex");
  const result = await pool.query(
    `INSERT INTO booking_payment_tokens
       (token, store_id, appointment_id, customer_id, customer_phone, requirement, deposit_amount_cents, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '${HOLD_WINDOW_MINUTES} minutes')
     RETURNING *`,
    [
      token,
      params.storeId,
      params.appointmentId,
      params.customerId,
      params.customerPhone,
      params.requirement,
      params.depositAmountCents,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function getBookingPaymentToken(token: string): Promise<BookingPaymentTokenRow | null> {
  const result = await pool.query(`SELECT * FROM booking_payment_tokens WHERE token = $1 LIMIT 1`, [token]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markBookingPaymentTokenUsed(tokenId: number): Promise<void> {
  await pool.query(`UPDATE booking_payment_tokens SET used_at = NOW() WHERE id = $1`, [tokenId]);
}

/** Unused, unexpired tokens created 20+ minutes ago that haven't had a reminder sent yet. */
export async function getTokensNeedingReminder(): Promise<BookingPaymentTokenRow[]> {
  const result = await pool.query(
    `SELECT * FROM booking_payment_tokens
     WHERE used_at IS NULL
       AND reminder_sent_at IS NULL
       AND expires_at > NOW()
       AND created_at <= NOW() - INTERVAL '20 minutes'`
  );
  return result.rows.map(mapRow);
}

export async function markBookingPaymentTokenReminderSent(tokenId: number): Promise<void> {
  await pool.query(`UPDATE booking_payment_tokens SET reminder_sent_at = NOW() WHERE id = $1`, [tokenId]);
}

/** Unused tokens whose 60-minute hold window has passed — the appointment gets deleted. */
export async function getExpiredUnusedTokens(): Promise<BookingPaymentTokenRow[]> {
  const result = await pool.query(
    `SELECT * FROM booking_payment_tokens WHERE used_at IS NULL AND expires_at <= NOW()`
  );
  return result.rows.map(mapRow);
}

export async function deleteBookingPaymentToken(tokenId: number): Promise<void> {
  await pool.query(`DELETE FROM booking_payment_tokens WHERE id = $1`, [tokenId]);
}
