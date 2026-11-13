/**
 * proPhoneVerification.ts — the Certxa Pro sign-up phone rule (owner, 2026-11-03).
 *
 * Every new app account proves a mobile number: Twilio Lookup must call it a mobile line (no landline, no VoIP),
 * the number must never have been on any account, and the owner types the 6-digit code texted to it. A correct
 * code hands back a one-time token that POST /api/solo/register needs, so the code step can't be skipped.
 *
 * account_phone_numbers keeps every number ever linked to an account and is never deleted from: a replaced
 * number is marked inactive and still counts as taken (migration 0294). Changing the number in account settings
 * always texts a code to the number being switched to — a new one, or one this account had before (owner,
 * 2026-11-13: no phone change without a code, to stop free-trial abuse).
 */

import crypto from "crypto";
import { pool } from "../db";
import { toE164US } from "./phoneUtils";
import { lookupPhoneType } from "./twilioLookup";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const TOKEN_MINUTES = 30;
const RESEND_SECONDS = 60;
const MAX_PER_PHONE_PER_DAY = 5;
const MAX_PER_IP_PER_HOUR = 10;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const codeHash = (phone: string, code: string) => sha256(`certxa-pro-phone:${phone}:${code}`);

export type PhoneStepResult = { ok: true; phone: string } | { ok: false; status: number; message: string };

/** The account a number is, or ever was, linked to (active or not), or null when no account has had it. */
export async function phoneNumberOwner(e164: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT user_id FROM account_phone_numbers WHERE phone = $1`, [e164]);
  return rows[0]?.user_id ?? null;
}

const TAKEN = "This mobile number is already linked to a Certxa account. Use a different number, or sign in to your account.";

/**
 * Checks the number and texts it a code. `ownUserId`: an account changing its own number may switch back to a number
 * it had before (still with a code); any other account's number, ever, is refused.
 */
export async function startPhoneVerification(input: string, ip: string, email?: string, ownUserId?: string): Promise<PhoneStepResult> {
  const phone = toE164US(input);
  if (!phone) return { ok: false, status: 400, message: "Enter a 10-digit US mobile number." };
  const owner = await phoneNumberOwner(phone);
  if (owner && owner !== ownUserId) return { ok: false, status: 409, message: TAKEN };

  const { rows: [counts] } = await pool.query(
    `SELECT count(*) FILTER (WHERE phone = $1 AND created_at > NOW() - make_interval(secs => $3))::int AS recent,
            count(*) FILTER (WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 day')::int AS phone_day,
            count(*) FILTER (WHERE ip = $2 AND created_at > NOW() - INTERVAL '1 hour')::int AS ip_hour
       FROM pro_phone_verifications
      WHERE (phone = $1 OR ip = $2) AND created_at > NOW() - INTERVAL '1 day'`,
    [phone, ip, RESEND_SECONDS],
  );
  if (counts.recent > 0) return { ok: false, status: 429, message: "We just sent a code. Wait a minute before asking for another one." };
  if (counts.phone_day >= MAX_PER_PHONE_PER_DAY || counts.ip_hour >= MAX_PER_IP_PER_HOUR) {
    return { ok: false, status: 429, message: "Too many codes requested. Please try again later." };
  }

  // Mobile only: landlines can't get texts, and VoIP numbers are free to make in bulk.
  const lookup = await lookupPhoneType(phone);
  if (!lookup) return { ok: false, status: 503, message: "We couldn't check this number right now. Please try again in a moment." };
  if (lookup.phoneType !== "mobile") {
    console.log(`[pro-phone] refused ${phone}: line type ${lookup.phoneType} (${lookup.carrierName ?? "no carrier"})`);
    return { ok: false, status: 400, message: "Use a mobile phone number. Landline, internet (VoIP) and virtual numbers can't be used." };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  // A new code replaces any earlier one for this number.
  await pool.query(`UPDATE pro_phone_verifications SET used_at = NOW() WHERE phone = $1 AND used_at IS NULL`, [phone]);
  await pool.query(
    `INSERT INTO pro_phone_verifications (phone, code_hash, line_type, carrier, ip, email, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(mins => $7))`,
    [phone, codeHash(phone, code), lookup.phoneType, lookup.carrierName, ip, email?.trim().toLowerCase().slice(0, 254) || null, CODE_MINUTES],
  );
  const { sendTwilioSms } = await import("../sms");
  const sent = await sendTwilioSms(phone, `${code} is your Certxa Pro verification code. It expires in ${CODE_MINUTES} minutes. Do not share this code.`);
  if (!sent.success) {
    console.error(`[pro-phone] code not delivered to ${phone}:`, sent.error);
    return { ok: false, status: 502, message: "We couldn't text this number. Check it and try again." };
  }
  return { ok: true, phone };
}

/** Checks a typed code. A correct one returns the token the sign-up sends with the account details. */
export async function checkPhoneCode(input: string, code: string): Promise<{ ok: true; token: string } | { ok: false; status: number; message: string }> {
  const phone = toE164US(input);
  if (!phone || !/^\d{6}$/.test(code)) return { ok: false, status: 400, message: "Enter the 6-digit code we texted you." };
  const { rows: [row] } = await pool.query(
    `SELECT id, code_hash, attempts, expires_at > NOW() AS live FROM pro_phone_verifications
      WHERE phone = $1 AND used_at IS NULL AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (!row || !row.live || row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 400, message: "This code has expired. Tap Send a new code." };
  }
  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(codeHash(phone, code), "hex");
  if (!crypto.timingSafeEqual(expected, given)) {
    await pool.query(`UPDATE pro_phone_verifications SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return { ok: false, status: 400, message: left > 0 ? "That code isn't right. Check the text and try again." : "That code isn't right. Tap Send a new code." };
  }
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(`UPDATE pro_phone_verifications SET verified_at = NOW(), token_hash = $2 WHERE id = $1`, [row.id, sha256(token)]);
  return { ok: true, token };
}

/** A checked code is spent once it has been used to change a number. */
export async function markVerificationUsed(id: number): Promise<void> {
  await pool.query(`UPDATE pro_phone_verifications SET used_at = NOW() WHERE id = $1`, [id]);
}

/** The verification a sign-up token stands for, when it is for this number, fresh and not used yet. */
export async function findVerifiedPhone(input: string, token: string): Promise<{ id: number; phone: string; lineType: string | null; carrier: string | null } | null> {
  const phone = toE164US(input);
  if (!phone || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { rows: [row] } = await pool.query(
    `SELECT id, phone, line_type, carrier FROM pro_phone_verifications
      WHERE phone = $1 AND token_hash = $2 AND used_at IS NULL
        AND verified_at > NOW() - make_interval(mins => $3)`,
    [phone, sha256(token), TOKEN_MINUTES],
  );
  return row ? { id: row.id, phone: row.phone, lineType: row.line_type, carrier: row.carrier } : null;
}

/**
 * Links the verified number to the account as its active number; the account's other numbers turn inactive
 * (kept, hidden). False when another account got the number first (the list's primary key decides). Marks the
 * verification used either way.
 */
export async function claimPhoneNumber(verification: { id: number; phone: string; lineType: string | null; carrier: string | null }, userId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE pro_phone_verifications SET used_at = NOW() WHERE id = $1`, [verification.id]);
    const { rowCount } = await client.query(
      `INSERT INTO account_phone_numbers (phone, user_id, status, line_type, carrier, verified_at)
       VALUES ($1, $2, 'active', $3, $4, NOW()) ON CONFLICT (phone) DO NOTHING`,
      [verification.phone, userId, verification.lineType, verification.carrier],
    );
    if (!rowCount) { await client.query("COMMIT"); return false; }
    await client.query(
      `UPDATE account_phone_numbers SET status = 'inactive', deactivated_at = NOW()
        WHERE user_id = $1 AND phone <> $2 AND status = 'active'`,
      [userId, verification.phone],
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Makes a number this account had before its active number again — only after a new text code to it was checked
 * (POST /api/account/phone/verify). False when the number isn't one of this account's.
 */
export async function reactivateOwnPhone(e164: string, userId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE account_phone_numbers SET status = 'active', deactivated_at = NULL WHERE phone = $1 AND user_id = $2`,
      [e164, userId],
    );
    if (rowCount) {
      await client.query(
        `UPDATE account_phone_numbers SET status = 'inactive', deactivated_at = NOW()
          WHERE user_id = $1 AND phone <> $2 AND status = 'active'`,
        [userId, e164],
      );
    }
    await client.query("COMMIT");
    return Boolean(rowCount);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Undo for a sign-up that failed after claiming: the account never existed, so the number is free again. */
export async function releaseClaimedPhone(phone: string, userId: string): Promise<void> {
  await pool.query(`DELETE FROM account_phone_numbers WHERE phone = $1 AND user_id = $2`, [phone, userId]);
}
