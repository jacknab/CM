/**
 * Plus calling and texting (owner, 2026-11-04): Certxa Pro Plus pros share one Certxa number, (949) 749-5557, the way
 * every business shares the two-way SMS number. A pro calls a client only from the client's profile (no dialer), and
 * replies to texts in Messages, always from this number. A call or text to the number reaches a pro only when the
 * caller is already one of that pro's clients (added by a booking or by the pro); when they are a client of several
 * Plus pros, the one they were last in touch with gets it, as for the two-way SMS (sms_contact_routing).
 * A pro counts only while their account is active, they are on Plus, and they have used the app in the last 30 days
 * (locations.pro_app_seen_at, or a notification registration); otherwise the caller hears a busy signal.
 * The webhooks are in routes/businessPhone.ts.
 */
import { pool } from "../db";
import { soloPlanCode } from "./soloSmsCredits";

export const plusNumber = (): string => process.env.CERTXA_PLUS_PHONE_NUMBER || "+19497495557";

export async function isPlusStore(storeId: number): Promise<boolean> {
  return (await soloPlanCode(storeId)) === "solo_plus";
}

/** The Plus pro a caller or texter belongs to: one of their clients, the one they were last in touch with. */
export async function routePlusContact(phoneE164: string): Promise<{ storeId: number; clientId: number; name: string } | null> {
  const r = await pool.query<{ store_id: number; client_id: number; name: string }>(
    `SELECT cp.store_id, c.id AS client_id,
            COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) AS name
       FROM client_phones cp
       JOIN clients c ON c.id = cp.client_id AND c.archived_at IS NULL
       JOIN locations l ON l.id = cp.store_id AND COALESCE(l.account_status, 'Active') = 'Active'
        AND GREATEST(l.pro_app_seen_at, (SELECT MAX(d.last_seen_at) FROM owner_push_devices d WHERE d.store_id = cp.store_id)) > now() - interval '30 days'
       JOIN LATERAL (
         SELECT sp.code FROM store_subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE s.store_id = cp.store_id AND s.status IN ('active', 'trialing') ORDER BY s.id DESC LIMIT 1
       ) plan ON plan.code = 'solo_plus'
      WHERE cp.phone_number_e164 = $1
      ORDER BY (SELECT r.last_interaction_at FROM sms_contact_routing r WHERE r.store_id = cp.store_id AND r.client_phone = $1) DESC NULLS LAST,
               (SELECT MAX(a.date) FROM appointments a WHERE a.store_id = cp.store_id AND a.customer_id = c.id) DESC NULLS LAST,
               cp.id DESC
      LIMIT 1`, [phoneE164]);
  const row = r.rows[0];
  return row ? { storeId: row.store_id, clientId: row.client_id, name: row.name } : null;
}

/** Whether a number is one of this business's clients (a Plus pro calls only their clients). */
export async function isStoreClient(storeId: number, phoneE164: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM client_phones cp JOIN clients c ON c.id = cp.client_id AND c.archived_at IS NULL
      WHERE cp.store_id = $1 AND cp.phone_number_e164 = $2 LIMIT 1`, [storeId, phoneE164]);
  return r.rows.length > 0;
}

/** This pro was just in touch with this client: a call or text back to the Plus number reaches them. */
export async function noteContact(storeId: number, phoneE164: string, inbound: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO sms_contact_routing (store_id, client_phone, last_inbound_at, last_interaction_at)
     VALUES ($1, $2, CASE WHEN $3 THEN now() END, now())
     ON CONFLICT (store_id, client_phone) DO UPDATE SET last_interaction_at = now(), updated_at = now(),
       last_inbound_at = CASE WHEN $3 THEN now() ELSE sms_contact_routing.last_inbound_at END,
       archived_at = CASE WHEN $3 THEN NULL ELSE sms_contact_routing.archived_at END`,
    [storeId, phoneE164, inbound]);
}
