/**
 * Win-back texts (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): a client who hasn't been back for a while
 * gets one text inviting them to book again. Replaces lapsed-client-scheduler.ts, which never sent anything (it read
 * the clients table's stale visit columns) and would have texted the same clients every day.
 *
 * Rules:
 *  • The business switches it on (store_settings.preferences.winBack = { enabled, afterDays }); off by default.
 *  • Last PAID visit (appointments, not the stale columns) between afterDays and 365 days ago, with nothing booked since.
 *  • Only clients who agreed to marketing texts (client_marketing_preferences.sms_marketing_opt_in = true): a win-back
 *    text is marketing (it costs a credit on the Solo plan).
 *  • One text per absence: never again until they have visited again (sms_log 'win_back' after the last visit).
 *  • Sent once a day, around 10 AM in the business's own time zone; one server process at a time (advisory lock).
 */
import { formatInTimeZone } from "date-fns-tz";
import { pool } from "../db";

export type WinBackSettings = { enabled: boolean; afterDays: number };
export const WIN_BACK_DAYS = [30, 45, 60, 90, 120] as const;

export function winBackSettings(prefs: Record<string, any> | null | undefined): WinBackSettings {
  const w = prefs?.winBack ?? {};
  const days = Number(w.afterDays);
  return { enabled: w.enabled === true, afterDays: (WIN_BACK_DAYS as readonly number[]).includes(days) ? days : 60 };
}

async function storePrefs(storeId: number): Promise<Record<string, any>> {
  const raw = (await pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId])).rows[0]?.preferences;
  try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? {}); } catch { return {}; }
}
export async function loadWinBackSettings(storeId: number): Promise<WinBackSettings> {
  return winBackSettings(await storePrefs(storeId));
}

/** The clients due a win-back text today at this business. */
export async function winBackCandidates(storeId: number, afterDays: number): Promise<{ id: number; firstName: string; phone: string }[]> {
  const { rows } = await pool.query(
    `WITH last_visit AS (
       SELECT a.customer_id, MAX(COALESCE(a.completed_at, a.date)) AS at
         FROM appointments a WHERE a.store_id = $1 AND a.status = 'completed' AND a.customer_id IS NOT NULL
        GROUP BY a.customer_id)
     SELECT c.id, COALESCE(NULLIF(TRIM(c.first_name), ''), split_part(c.full_name, ' ', 1)) AS first_name,
            (SELECT p.phone_number_e164 FROM client_phones p WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) AS phone
       FROM clients c JOIN last_visit v ON v.customer_id = c.id
      WHERE c.store_id = $1 AND c.archived_at IS NULL
        AND v.at < now() - make_interval(days => $2) AND v.at > now() - interval '365 days'
        AND EXISTS (SELECT 1 FROM client_marketing_preferences mp WHERE mp.client_id = c.id AND mp.sms_marketing_opt_in = true)
        AND NOT EXISTS (SELECT 1 FROM appointments n WHERE n.store_id = $1 AND n.customer_id = c.id AND n.date > v.at
                          AND n.status NOT IN ('cancelled', 'no_show'))
        AND NOT EXISTS (SELECT 1 FROM sms_log l WHERE l.store_id = $1 AND l.customer_id = c.id AND l.message_type = 'win_back' AND l.sent_at > v.at)
      LIMIT 200`,
    [storeId, afterDays],
  );
  return rows.filter((r: any) => r.phone).map((r: any) => ({ id: Number(r.id), firstName: String(r.first_name || "").trim() || "there", phone: String(r.phone) }));
}

async function runStore(store: { id: number; name: string; slug: string | null; timezone: string }): Promise<number> {
  const settings = await loadWinBackSettings(store.id);
  if (!settings.enabled) return 0;
  const link = store.slug ? `${(process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "")}/book/${store.slug}` : null;
  const { sendSms } = await import("../sms");
  let sent = 0;
  for (const c of await winBackCandidates(store.id, settings.afterDays)) {
    const body = `Hi ${c.firstName}, it's been a while! We'd love to see you again at ${store.name}.${link ? ` Book your next visit: ${link}` : ""} Reply STOP to opt out.`;
    const r = await sendSms(store.id, c.phone, body, "win_back", undefined, c.id).catch(() => null);
    if (r?.success && !r.skipped) sent++;
  }
  return sent;
}

let started = false;
/** Hourly: every business where it is now 10 AM and win-back is on. */
export function startWinBackJob(): void {
  if (started) return;
  started = true;
  const run = async () => {
    const client = await pool.connect().catch(() => null);
    if (!client) return;
    try {
      const lock = await client.query(`SELECT pg_try_advisory_lock(hashtext('win_back_job')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      try {
        const stores = await client.query(
          `SELECT l.id, l.name, l.booking_slug AS slug, COALESCE(l.timezone, 'UTC') AS timezone FROM locations l
             JOIN store_settings s ON s.store_id = l.id
            WHERE s.preferences::text LIKE '%"winBack"%' AND LOWER(COALESCE(l.account_status, 'active')) NOT IN ('suspended', 'canceled', 'locked')`);
        for (const s of stores.rows) {
          if (Number(formatInTimeZone(new Date(), s.timezone, "H")) !== 10) continue;
          const n = await runStore(s).catch((e) => { console.warn("[win-back] store", s.id, e?.message); return 0; });
          if (n) console.log(`[win-back] store=${s.id} sent ${n}`);
        }
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('win_back_job'))`).catch(() => {});
      }
    } catch (e: any) {
      console.warn("[win-back] job:", e?.message);
    } finally {
      client.release();
    }
  };
  setInterval(() => void run(), 60 * 60 * 1000);
}
