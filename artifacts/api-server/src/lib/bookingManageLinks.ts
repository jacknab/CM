/**
 * bookingManageLinks.ts
 *
 * Short, random, unguessable per-appointment token for the client-facing
 * "manage my booking" link (view + cancel) sent in confirmation/reminder SMS.
 *
 * The token — not the numeric appointment id — is the only credential the
 * public GET/POST /api/booking/manage/:token endpoints accept, so a client
 * can only ever reach their own single booking and nobody can enumerate
 * bookings by guessing ids or phone numbers.
 */

import crypto from "crypto";
import { pool } from "../db";

/** ~11-char URL-safe code, ~64 bits of entropy, non-sequential. */
export function generateManageCode(): string {
  return crypto.randomBytes(8).toString("base64url");
}

/** Public base URL for the SPA (mirrors lapsed-client-scheduler.ts). */
export function buildManageUrl(token: string): string {
  const base = (process.env.APP_URL || "https://certxa.com").replace(/\/$/, "");
  return `${base}/b/${token}`;
}

/**
 * Return this appointment's manage token, generating and persisting one on
 * first use. Safe to call repeatedly — a row keeps the same token for life.
 */
export async function getOrCreateManageToken(appointmentId: number): Promise<string> {
  const existing = await pool.query(
    `SELECT manage_token FROM appointments WHERE id = $1`,
    [appointmentId],
  );
  const current = existing.rows[0]?.manage_token;
  if (typeof current === "string" && current.length > 0) return current;

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateManageCode();
    try {
      const res = await pool.query(
        `UPDATE appointments
           SET manage_token = $1
         WHERE id = $2 AND manage_token IS NULL
         RETURNING manage_token`,
        [token, appointmentId],
      );
      if (res.rows[0]?.manage_token) return res.rows[0].manage_token;

      // No row updated — either the appointment vanished or another request
      // set the token first. Re-read and use whatever is there now.
      const reread = await pool.query(
        `SELECT manage_token FROM appointments WHERE id = $1`,
        [appointmentId],
      );
      const now = reread.rows[0]?.manage_token;
      if (typeof now === "string" && now.length > 0) return now;
      // appointment not found — fall through to a throw below
      break;
    } catch (err: any) {
      // 23505 = unique_violation on appointments_manage_token_udx — retry
      if (err?.code === "23505") continue;
      throw err;
    }
  }

  throw new Error(`Could not assign a manage token to appointment ${appointmentId}`);
}
