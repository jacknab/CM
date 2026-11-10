/**
 * Claiming a Certxa-prepared salon page (owner, 2026-11-10). Every unclaimed page says "Is this your salon? Call Certxa
 * at (888) 814-7623" (lib/preparedSalon.ts). That number is Tom, the sales line (routes/salesAgent.ts), who:
 *   - finds the salon (findPreparedSalons) by its name, phone number or city;
 *   - texts the owner a one-time claim link (createClaimLink) to certxa.com/claim/<token>;
 *   - records a request to take the page down (recordRemovalRequest): the team removes it.
 * Tom verifies ownership first (owner, 2026-11-10): a call from the salon's listed number is the owner; otherwise, with the
 * caller at the salon, Tom hangs up and calls the listed number back a minute later asking for them by name
 * (scheduleClaimCallback, placeDueClaimCallbacks). Only then does he text the claim link, which starts verified. On the
 * claim page (routes/salonClaim.ts) the owner creates a Certxa Salon login and the prepared account moves over to it
 * (a link not verified by Tom asks for a code read out in a call to the salon's number instead)
 * (completeSalonClaim): the same salon, page, menu and hours, now theirs, on the salon trial instead of the Solo plan it
 * was prepared on. The sign-up's one-business-per-phone/address rule is why the account is moved, never duplicated.
 */
import crypto from "node:crypto";
import { pool } from "../db";
import { sendTwilioSms } from "../sms";
import { possessive } from "./salonSeo";

const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
export const CLAIM_LINK_DAYS = 7;
const CODE_MINUTES = 15;
const MAX_CODE_CALLS = 3;
const MAX_CODE_ATTEMPTS = 5;

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export type PreparedSalonMatch = {
  jobId: number; storeId: number; name: string; street: string | null; city: string | null; state: string | null;
  phone: string | null; pageUrl: string; claimed: boolean;
};

/** Prepared salons matching what the caller said: a phone number (best), else name words and/or city. Up to 5. */
export async function findPreparedSalons(q: { name?: string; phone?: string; city?: string }): Promise<PreparedSalonMatch[]> {
  // A repeated area code ("657 657 440 6958"): the last ten digits are the number.
  const phone = digits(q.phone).slice(-10);
  const name = String(q.name ?? "").trim().toLowerCase().replace(/[^a-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();
  const city = String(q.city ?? "").trim().toLowerCase();
  if (phone.length !== 10 && name.length < 2 && city.length < 2) return [];
  const words = name.split(" ").filter((w) => w.length >= 2 && !["nail", "nails", "spa", "salon", "the", "and", "bar", "&"].includes(w));
  const { rows } = await pool.query(
    `SELECT j.id AS job_id, j.store_id, j.status, j.claimed_at, l.name, l.address, l.city, l.state, l.phone, l.booking_slug
       FROM salon_account_creation_jobs j JOIN locations l ON l.id = j.store_id
      WHERE j.status IN ('created', 'claimed', 'expired')
        AND (
          -- The salon's phone number settles it.
          ($1::text <> '' AND right(regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g'), 10) = $1)
          -- Else every distinctive word of the name, and the city when given (one of the two is needed).
          OR ($1::text = '' AND (cardinality($2::text[]) > 0 OR $3::text <> '')
              AND (cardinality($2::text[]) = 0 OR (SELECT bool_and(lower(l.name) LIKE '%' || w || '%') FROM unnest($2::text[]) w))
              AND ($3::text = '' OR lower(coalesce(l.city, '') || ' ' || coalesce(l.address, '')) LIKE '%' || $3 || '%'))
        )
      ORDER BY j.id LIMIT 5`,
    [phone.length === 10 ? phone : "", words, city],
  );
  return rows.map((r: any) => {
    const parts = String(r.address ?? "").split(",").map((p: string) => p.trim()).filter(Boolean);
    return {
      jobId: Number(r.job_id), storeId: Number(r.store_id), name: r.name,
      street: parts[0] ?? null, city: r.city || parts[parts.length - (/usa?$/i.test(parts[parts.length - 1] ?? "") ? 3 : 2)] || null,
      state: r.state || null, phone: r.phone ?? null,
      pageUrl: `https://${r.booking_slug}.certxa.com/`, claimed: r.status === "claimed" || r.claimed_at != null,
    };
  });
}

/** A one-time claim link for this prepared salon, texted to the owner's mobile. verifiedBy: how Tom confirmed ownership. */
export async function createClaimLink(jobId: number, sendTo: string, verifiedBy: "caller_id" | "callback" | null = null): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { rows: [job] } = await pool.query(
    `SELECT j.id, j.status, j.claimed_at, l.name FROM salon_account_creation_jobs j JOIN locations l ON l.id = j.store_id WHERE j.id = $1`, [jobId]);
  if (!job) return { ok: false, message: "That salon was not found." };
  if (job.status === "claimed" || job.claimed_at) return { ok: false, message: "This salon's page has already been claimed." };
  if (job.status !== "created") return { ok: false, message: "This salon's page can't be claimed right now. The team can help: support@certxa.com." };
  const token = crypto.randomBytes(24).toString("base64url");
  await pool.query(
    `INSERT INTO salon_claim_links (token_hash, job_id, sent_to, expires_at, verified_at, verified_by)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END, $5)`,
    [hashToken(token), jobId, digits(sendTo) || null, String(CLAIM_LINK_DAYS), verifiedBy]);
  const url = `${SITE()}/claim/${token}`;
  const sms = await sendTwilioSms(sendTo, verifiedBy
    ? `Certxa: claim ${possessive(job.name)} page here: ${url} Create your login and it's yours (link works for ${CLAIM_LINK_DAYS} days).`
    : `Certxa: claim ${possessive(job.name)} page here: ${url} (link works for ${CLAIM_LINK_DAYS} days). We'll call the salon's phone with a code to confirm it's yours.`);
  if (!sms.success) return { ok: false, message: "The text could not be sent." };
  await pool.query(`INSERT INTO salon_account_creation_logs (job_id, source_salon_id, event, message, details)
                    SELECT id, source_salon_id, 'claim_link_sent', 'Tom texted a claim link.', $2::jsonb FROM salon_account_creation_jobs WHERE id = $1`,
    [jobId, JSON.stringify({ to: digits(sendTo).slice(-4) })]).catch(() => {});
  return { ok: true, url };
}

/** The owner asked Certxa to take the page down: recorded for the team, who remove it. */
export async function recordRemovalRequest(input: { jobId?: number | null; callerPhone?: string | null; callerName?: string | null; notes?: string | null }): Promise<void> {
  const jobId = Number(input.jobId) > 0 ? Number(input.jobId) : null;
  const store = jobId ? (await pool.query(`SELECT store_id, source_salon_id FROM salon_account_creation_jobs WHERE id = $1`, [jobId])).rows[0] : null;
  await pool.query(
    `INSERT INTO salon_page_removal_requests (job_id, store_id, caller_phone, caller_name, notes) VALUES ($1, $2, $3, $4, $5)`,
    [jobId, store?.store_id ?? null, input.callerPhone ?? null, input.callerName?.slice(0, 120) ?? null, input.notes?.slice(0, 1000) ?? null]);
  if (jobId) {
    await pool.query(`INSERT INTO salon_account_creation_logs (job_id, source_salon_id, event, message, details) VALUES ($1, $2, 'removal_requested', 'The owner asked by phone for the page to be taken down.', '{}'::jsonb)`,
      [jobId, store?.source_salon_id ?? null]).catch(() => {});
  }
  console.log(`[salon-claim] removal request recorded job=${jobId ?? "unknown"}`);
}

// ── The claim page ────────────────────────────────────────────────────────────

type LinkRow = {
  id: number; job_id: number; code_hash: string | null; code_expires_at: Date | null; code_calls: number; code_attempts: number;
  verified_at: Date | null; used_at: Date | null; expires_at: Date; status: string; claimed_at: Date | null;
  store_id: number; name: string; address: string | null; phone: string | null; booking_slug: string;
};

export async function loadClaimLink(token: string): Promise<LinkRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows: [row] } = await pool.query<LinkRow>(
    `SELECT c.id, c.job_id, c.code_hash, c.code_expires_at, c.code_calls, c.code_attempts, c.verified_at, c.used_at, c.expires_at,
            j.status, j.claimed_at, j.store_id, l.name, l.address, l.phone, l.booking_slug
       FROM salon_claim_links c JOIN salon_account_creation_jobs j ON j.id = c.job_id JOIN locations l ON l.id = j.store_id
      WHERE c.token_hash = $1`, [hashToken(token)]);
  return row ?? null;
}

export const maskPhone = (phone: string | null) => {
  const d = digits(phone);
  return d.length === 10 ? `(${d.slice(0, 3)}) ***-${d.slice(6)}` : null;
};

/** Calls the salon's listed number and reads out a 6-digit code twice. */
export async function callClaimCode(link: LinkRow): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const to = digits(link.phone);
  if (to.length !== 10) return { ok: false, status: 409, message: "This salon has no phone number on file to call. Contact support@certxa.com to claim it." };
  if (link.code_calls >= MAX_CODE_CALLS) return { ok: false, status: 429, message: "We've already called three times. Contact support@certxa.com to claim it." };
  const sid = process.env.TWILIO_ACCOUNT_SID, auth = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !auth || !from) return { ok: false, status: 503, message: "Calling isn't available right now. Please try again later." };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const spoken = code.split("").join(", ");
  const twiml = `<Response><Pause length="1"/><Say voice="Polly.Joanna">Hello. This is Certxa. Your code to claim ${escXml(link.name)}'s page is: ${spoken}. Again, the code is: ${spoken}. Goodbye.</Say></Response>`;
  try {
    const { default: Twilio } = await import("twilio");
    await Twilio(sid, auth).calls.create({ to: `+1${to}`, from, twiml, timeout: 40 });
  } catch (err: any) {
    console.warn("[salon-claim] code call failed:", err?.message ?? err);
    return { ok: false, status: 502, message: "We couldn't place the call. Please try again in a minute." };
  }
  await pool.query(
    `UPDATE salon_claim_links SET code_hash = $2, code_expires_at = now() + ($3 || ' minutes')::interval, code_calls = code_calls + 1, code_attempts = 0 WHERE id = $1`,
    [link.id, hashToken(code), String(CODE_MINUTES)]);
  return { ok: true };
}

export async function checkClaimCode(link: LinkRow, code: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!link.code_hash || !link.code_expires_at || new Date(link.code_expires_at) < new Date()) {
    return { ok: false, status: 400, message: "That code has expired. Ask for a new call." };
  }
  if (link.code_attempts >= MAX_CODE_ATTEMPTS) return { ok: false, status: 429, message: "Too many tries. Ask for a new call." };
  if (hashToken(String(code).replace(/\D/g, "")) !== link.code_hash) {
    await pool.query(`UPDATE salon_claim_links SET code_attempts = code_attempts + 1 WHERE id = $1`, [link.id]);
    return { ok: false, status: 400, message: "That code isn't right. Check it and try again." };
  }
  await pool.query(`UPDATE salon_claim_links SET verified_at = now(), code_hash = NULL WHERE id = $1`, [link.id]);
  return { ok: true };
}

/**
 * Moves the prepared account to the signed-in owner (a Certxa Salon login with no business of its own yet). The Solo
 * plan Certxa prepared it on ends, so the owner's salon trial applies.
 */
export async function completeSalonClaim(link: LinkRow, userId: string): Promise<{ ok: true; storeId: number } | { ok: false; status: number; message: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [job] } = await client.query(
      `SELECT id, source_salon_id, store_id, user_id, status FROM salon_account_creation_jobs WHERE id = $1 FOR UPDATE`, [link.job_id]);
    if (!job || job.status !== "created" || !job.store_id || !job.user_id) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, message: "This salon's page has already been claimed." };
    }
    const { rows: [user] } = await client.query(
      `SELECT id, email, phone, account_type, unclaimed_at FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!user || user.unclaimed_at || !user.email || String(user.email).endsWith(".invalid")) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, message: "Sign in with your own Certxa login first." };
    }
    if (user.account_type === "certxa_pro") {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, message: "This login is a Certxa Pro account. Create a Certxa Salon login to claim the salon." };
    }
    if ((await client.query(`SELECT 1 FROM locations WHERE user_id = $1 AND id <> $2 LIMIT 1`, [userId, job.store_id])).rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, message: "This login already has a business. Contact support@certxa.com to add another." };
    }
    const moved = await client.query(`UPDATE locations SET user_id = $1, email = $2 WHERE id = $3 AND user_id = $4`, [userId, user.email, job.store_id, job.user_id]);
    if (!moved.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, message: "This salon's page has already been claimed." };
    }
    // The Solo plan Certxa prepared the page on ends; the owner's salon trial applies (lib/featureAccess resolveStorePlan).
    await client.query(`UPDATE store_subscriptions SET status = 'canceled', updated_at = now() WHERE store_id = $1 AND status IN ('active', 'trialing')`, [job.store_id]);
    await client.query(`UPDATE users SET staff_id = (SELECT id FROM staff WHERE store_id = $1 ORDER BY id LIMIT 1), onboarding_completed = true WHERE id = $2`, [job.store_id, userId]);
    await client.query(`UPDATE salon_account_creation_jobs SET status = 'claimed', claimed_at = now(), claimed_by_user_id = $2, user_id = $2, google_data_expires_at = NULL, updated_at = now() WHERE id = $1`, [job.id, userId]);
    await client.query(`UPDATE salon_claim_links SET used_at = now() WHERE id = $1`, [link.id]);
    await client.query(
      `INSERT INTO salon_account_creation_logs (job_id, source_salon_id, event, message, details)
       VALUES ($1, $2, 'owner_claimed', 'The owner claimed the page themselves (phone-code verified) as a Certxa Salon account.', $3::jsonb)`,
      [job.id, job.source_salon_id, JSON.stringify({ ownerUserId: userId, claimLinkId: link.id, verifiedBy: "salon_phone_call" })]);
    await client.query("COMMIT");
    await pool.query(`UPDATE directory_listings SET store_id = $2, claimed_at = now() WHERE nail_salon_id = $1 AND opted_out_at IS NULL`, [job.source_salon_id, job.store_id]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = $1 AND unclaimed_at IS NOT NULL`, [job.user_id]).catch(() => {});
    console.log(`[salon-claim] job=${job.id} store=${job.store_id} claimed by ${userId}`);
    return { ok: true, storeId: Number(job.store_id) };
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[salon-claim] complete failed:", err?.message ?? err);
    return { ok: false, status: 500, message: "We couldn't finish the claim. Please try again." };
  } finally {
    client.release();
  }
}

function escXml(s: string): string {
  return s.replace(/&/g, "and").replace(/[<>"']/g, "");
}

// ── Tom's ownership call-back ─────────────────────────────────────────────────

/** The unclaimed prepared salon whose listed phone number this is (a caller on the salon's own line), if any. */
export async function unclaimedSalonByPhone(phone: string | null | undefined): Promise<PreparedSalonMatch | null> {
  if (digits(phone).length !== 10) return null;
  const match = (await findPreparedSalons({ phone: String(phone) }).catch(() => [])).find((m) => !m.claimed);
  return match ?? null;
}

/**
 * Tom will call the salon's listed number in about a minute and ask for the caller by name. Returns the number he'll
 * call, or why he can't.
 */
export async function scheduleClaimCallback(jobId: number, callerName: string, callerPhone: string | null):
  Promise<{ ok: true; salonPhone: string; salonName: string; code: string } | { ok: false; message: string }> {
  const { rows: [job] } = await pool.query(
    `SELECT j.status, j.claimed_at, l.name, l.phone FROM salon_account_creation_jobs j JOIN locations l ON l.id = j.store_id WHERE j.id = $1`, [jobId]);
  if (!job) return { ok: false, message: "That salon was not found. Use find_prepared_salon first." };
  if (job.status !== "created" || job.claimed_at) return { ok: false, message: "This salon's page has already been claimed or can't be claimed." };
  const salonPhone = digits(job.phone);
  if (salonPhone.length !== 10) return { ok: false, message: "This salon has no phone number on file to call. Direct them to support@certxa.com." };
  const recent = await pool.query(`SELECT 1 FROM salon_claim_callbacks WHERE job_id = $1 AND created_at > now() - interval '1 day' GROUP BY job_id HAVING count(*) >= 3`, [jobId]);
  if (recent.rowCount) return { ok: false, message: "This salon has already been called back three times today. Direct them to support@certxa.com." };
  const name = callerName.trim().slice(0, 60);
  if (name.length < 2) return { ok: false, message: "Ask for the caller's name first: you'll ask for them by name when you call the salon." };
  // The number Tom gives the caller now and asks for on the call-back (owner, 2026-11-10): 10–99.
  const code = String(crypto.randomInt(10, 100));
  await pool.query(
    `INSERT INTO salon_claim_callbacks (token, job_id, caller_name, caller_phone, salon_phone, call_at, verify_code) VALUES ($1, $2, $3, $4, $5, now() + interval '60 seconds', $6)`,
    [crypto.randomBytes(18).toString("base64url"), jobId, name, digits(callerPhone) || null, salonPhone, code]);
  return { ok: true, salonPhone: `(${salonPhone.slice(0, 3)}) ${salonPhone.slice(3, 6)}-${salonPhone.slice(6)}`, salonName: job.name, code };
}

/** Places every call-back that is due (each server process runs this; the UPDATE gives each call to one of them). */
export async function placeDueClaimCallbacks(webhookUrl: string, fromNumber: string): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE salon_claim_callbacks SET status = 'calling', updated_at = now()
      WHERE id IN (SELECT id FROM salon_claim_callbacks WHERE status = 'pending' AND call_at <= now() ORDER BY id LIMIT 5 FOR UPDATE SKIP LOCKED)
      RETURNING id, token, salon_phone`);
  if (!rows.length) return;
  const sid = process.env.TWILIO_ACCOUNT_SID, auth = process.env.TWILIO_AUTH_TOKEN;
  const { default: Twilio } = await import("twilio");
  for (const row of rows) {
    try {
      if (!sid || !auth) throw new Error("Twilio is not configured");
      const call = await Twilio(sid, auth).calls.create({
        to: `+1${row.salon_phone}`, from: fromNumber, url: `${webhookUrl}?claimCallback=${encodeURIComponent(row.token)}`, timeout: 40,
      });
      await pool.query(`UPDATE salon_claim_callbacks SET call_sid = $2, updated_at = now() WHERE id = $1`, [row.id, call.sid]);
      console.log(`[salon-claim] call-back ${row.id} placed`);
    } catch (err: any) {
      await pool.query(`UPDATE salon_claim_callbacks SET status = 'failed', updated_at = now() WHERE id = $1`, [row.id]);
      console.warn(`[salon-claim] call-back ${row.id} failed:`, err?.message ?? err);
    }
  }
}

export type ClaimCallbackContext = { callbackId: number; jobId: number; callerName: string; salonName: string; street: string | null; city: string | null };

/** The call-back this outbound call is for (its token came in the call's webhook URL), marked connected. */
export async function claimCallbackForCall(token: string): Promise<ClaimCallbackContext | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { rows: [row] } = await pool.query(
    `UPDATE salon_claim_callbacks c SET status = 'connected', updated_at = now()
       FROM salon_account_creation_jobs j JOIN locations l ON l.id = j.store_id
      WHERE c.token = $1 AND c.status = 'calling' AND j.id = c.job_id
      RETURNING c.id, c.job_id, c.caller_name, l.name, l.address, l.city`, [token]);
  if (!row) return null;
  const parts = String(row.address ?? "").split(",").map((p: string) => p.trim()).filter(Boolean);
  return { callbackId: Number(row.id), jobId: Number(row.job_id), callerName: row.caller_name, salonName: row.name, street: parts[0] ?? null, city: row.city || parts[1] || null };
}

/** Is this call-back token one Tom placed and hasn't been answered yet (for the call webhook)? */
export async function claimCallbackIsCalling(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  return Boolean((await pool.query(`SELECT 1 FROM salon_claim_callbacks WHERE token = $1 AND status = 'calling'`, [token])).rowCount);
}

/** The number the person on the call-back says: the one Tom gave them before hanging up? Three tries. */
export async function checkCallbackCode(callbackId: number, spoken: string): Promise<"ok" | "wrong" | "locked"> {
  const said = String(spoken ?? "").replace(/\D/g, "");
  const { rows: [row] } = await pool.query(
    `UPDATE salon_claim_callbacks SET code_attempts = code_attempts + 1, updated_at = now()
      WHERE id = $1 AND code_attempts < 3 RETURNING verify_code, code_attempts`, [callbackId]);
  if (!row) return "locked";
  if (said && said === String(row.verify_code)) {
    await pool.query(`UPDATE salon_claim_callbacks SET status = 'verified', updated_at = now() WHERE id = $1`, [callbackId]);
    return "ok";
  }
  return Number(row.code_attempts) >= 3 ? "locked" : "wrong";
}
