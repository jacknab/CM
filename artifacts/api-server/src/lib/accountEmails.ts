/**
 * Extra e-mail addresses on an account (owner, 2026-11-13; migration 0358).
 *
 * The sign-up e-mail is the login and never changes (it stops free-trial abuse). The owner can add other addresses in
 * Settings → Personal Details; each one gets a confirmation link first, and once confirmed, every e-mail Certxa sends
 * to the account's login address also goes to it (mail.ts sendEmail → accountCopyRecipients). An unconfirmed address
 * gets nothing but its confirmation e-mail, so a typo can never receive account mail (password resets included).
 */
import crypto from "crypto";
import { pool } from "../db";

export const MAX_EXTRA_EMAILS = 5;
const CONFIRM_HOURS = 48;
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
export const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

export type ExtraEmail = { id: number; email: string; confirmed: boolean; createdAt: string };

export async function listExtraEmails(userId: string): Promise<ExtraEmail[]> {
  const { rows } = await pool.query(
    `SELECT id, email, verified_at IS NOT NULL AS confirmed, created_at FROM account_emails WHERE user_id = $1 ORDER BY id`, [userId]);
  return rows.map((r) => ({ id: r.id, email: r.email, confirmed: r.confirmed, createdAt: r.created_at }));
}

/** Adds (or re-issues a link for) an address; returns the confirmation token to e-mail. */
export async function addExtraEmail(userId: string, input: string): Promise<{ ok: true; id: number; email: string; token: string } | { ok: false; status: number; message: string }> {
  const email = input.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, status: 400, message: "Enter a valid e-mail address." };
  const { rows: [me] } = await pool.query(`SELECT lower(email) AS email FROM users WHERE id = $1`, [userId]);
  if (!me) return { ok: false, status: 404, message: "Account not found." };
  if (me.email === email) return { ok: false, status: 400, message: "That is already your account e-mail." };
  const { rows: [count] } = await pool.query(`SELECT count(*)::int AS n FROM account_emails WHERE user_id = $1 AND lower(email) <> $2`, [userId, email]);
  if (count.n >= MAX_EXTRA_EMAILS) return { ok: false, status: 400, message: `You can add up to ${MAX_EXTRA_EMAILS} e-mail addresses.` };
  const token = crypto.randomBytes(32).toString("hex");
  const { rows: [row] } = await pool.query(
    `INSERT INTO account_emails (user_id, email, verify_token_hash, verify_expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(hours => $4))
     ON CONFLICT (user_id, lower(email)) DO UPDATE
       SET verify_token_hash = CASE WHEN account_emails.verified_at IS NULL THEN EXCLUDED.verify_token_hash ELSE account_emails.verify_token_hash END,
           verify_expires_at = CASE WHEN account_emails.verified_at IS NULL THEN EXCLUDED.verify_expires_at ELSE account_emails.verify_expires_at END
     RETURNING id, verified_at`,
    [userId, email, sha256(token), CONFIRM_HOURS]);
  if (row.verified_at) return { ok: false, status: 409, message: "That address is already added and confirmed." };
  return { ok: true, id: row.id, email, token };
}

/** A token from the confirmation link: marks the address confirmed. */
export async function confirmExtraEmail(token: string): Promise<{ email: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { rows: [row] } = await pool.query(
    `UPDATE account_emails SET verified_at = NOW(), verify_token_hash = NULL, verify_expires_at = NULL
      WHERE verify_token_hash = $1 AND verify_expires_at > NOW() AND verified_at IS NULL RETURNING email`, [sha256(token)]);
  return row ? { email: row.email } : null;
}

export async function removeExtraEmail(userId: string, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM account_emails WHERE id = $1 AND user_id = $2`, [id, userId]);
  return Boolean(rowCount);
}

/**
 * The confirmed extra addresses of the account whose LOGIN e-mail is `to` (none when `to` isn't a login, or the
 * account has none). Never throws: a lookup problem must not stop the original e-mail.
 */
export async function accountCopyRecipients(to: string): Promise<string[]> {
  try {
    const { rows } = await pool.query(
      `SELECT e.email FROM account_emails e JOIN users u ON u.id = e.user_id
        WHERE lower(u.email) = lower($1) AND e.verified_at IS NOT NULL AND lower(e.email) <> lower($1)
        ORDER BY e.id`, [to.trim()]);
    return rows.map((r) => r.email);
  } catch {
    return [];
  }
}
