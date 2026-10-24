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
  /** How long the time is held for payment. Default 60 minutes (AI receptionist, online booking);
   *  a booking the professional approved gets 24 hours (lib/bookingRequests.ts). */
  holdMinutes?: number;
}): Promise<BookingPaymentTokenRow> {
  const token = crypto.randomBytes(24).toString("hex");
  const holdMinutes = Math.max(5, Math.round(params.holdMinutes ?? HOLD_WINDOW_MINUTES));
  const result = await pool.query(
    `INSERT INTO booking_payment_tokens
       (token, store_id, appointment_id, customer_id, customer_phone, requirement, deposit_amount_cents, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + make_interval(mins => $8))
     RETURNING *`,
    [
      token,
      params.storeId,
      params.appointmentId,
      params.customerId,
      params.customerPhone,
      params.requirement,
      params.depositAmountCents,
      holdMinutes,
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

/** Unused, unexpired tokens a third of the way through their hold (20 minutes of an hour, 8 hours of a day)
 *  that haven't had a reminder sent yet. */
export async function getTokensNeedingReminder(): Promise<BookingPaymentTokenRow[]> {
  const result = await pool.query(
    `SELECT * FROM booking_payment_tokens
     WHERE used_at IS NULL
       AND reminder_sent_at IS NULL
       AND expires_at > NOW()
       AND created_at <= NOW() - (expires_at - created_at) / 3`
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


/** "the next hour", "the next 24 hours", "about 40 minutes", "about 16 hours": what is left of a hold, for texts. */
export function holdTimeLeft(expiresAt: Date, prefix: "next" | "about" = "about"): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  if (minutes < 90) return prefix === "next" ? (minutes >= 55 ? "the next hour" : `the next ${minutes} minutes`) : `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return prefix === "next" ? `the next ${hours} hours` : `about ${hours} hours`;
}

/**
 * The deposit an online booking owes, in cents, when the business asks for one (POS → Booking payments, or
 * the Certxa Pro app's Settings → Deposits): a fixed amount or a percentage of the visit, at least Stripe's
 * 50-cent minimum. Null when the business takes no deposit or can't take cards yet.
 */
export async function depositCentsFor(storeId: number, visitTotalCents: number): Promise<number | null> {
  const row = await pool.query<{ booking_payment_policy: string | null; deposit_type: string | null; deposit_value: string | null; connected: boolean }>(
    `SELECT l.booking_payment_policy, l.deposit_type, l.deposit_value,
            EXISTS (SELECT 1 FROM store_payment_accounts p WHERE p.store_id = l.id AND p.provider = 'stripe' AND p.status = 'connected') AS connected
       FROM locations l WHERE l.id = $1`, [storeId]);
  const r = row.rows[0];
  if (!r || r.booking_payment_policy !== "deposit" || !r.connected || !process.env.STRIPE_SECRET_KEY) return null;
  const value = Number(r.deposit_value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = r.deposit_type === "percentage" ? Math.round(visitTotalCents * value / 100) : Math.round(value * 100);
  return Math.max(50, cents);
}
