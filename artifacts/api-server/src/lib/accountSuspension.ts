/**
 * A salon whose account is suspended (unpaid) or closed keeps its data — the owner can still open their account,
 * clients, catalogue and reports — but these stop until it is paid: /nail and /calendar (AccountStatusGate on the
 * website, the /api block in routes.ts), the online booking page and website, Autumn, and every SMS the salon
 * sends (sendSms). The owner's own sign-in codes are not the salon's texts and still go out (sendTwilioSms).
 */
import { pool } from "../db";

const CACHE_MS = 30_000;
const cache = new Map<number, { stopped: boolean; at: number }>();

/** True when the salon's account is suspended, locked or cancelled, or its free trial has ended. A failed check never blocks. */
export async function isAccountStopped(storeId: number): Promise<boolean> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.stopped;
  try {
    // A free trial that has ended stops the salon at once (owner, 2026-10-31: no waiting period), before the
    // hourly trial job marks the account suspended. A paid plan (store_subscriptions 'active') never stops here.
    const { rows } = await pool.query(
      `SELECT lower(coalesce(l.account_status, 'active')) AS status,
              (u.subscription_status IN ('trial', 'expired') AND u.trial_ends_at IS NOT NULL AND u.trial_ends_at <= now()
                AND NOT COALESCE(u.is_admin, false) -- a platform admin's own salon is exempt (owner, 2026-10-31)
                AND NOT EXISTS (SELECT 1 FROM store_subscriptions ss WHERE ss.store_id = l.id AND ss.status = 'active')) AS trial_over
         FROM locations l LEFT JOIN users u ON u.id = l.user_id
        WHERE l.id = $1`,
      [storeId],
    );
    const stopped = ["suspended", "locked", "canceled", "cancelled"].includes(String(rows[0]?.status ?? "active")) || rows[0]?.trial_over === true;
    cache.set(storeId, { stopped, at: Date.now() });
    return stopped;
  } catch {
    return false;
  }
}

/** Forget the cached status (support suspended or restored the account just now). */
export function forgetAccountStatus(storeId: number): void {
  cache.delete(storeId);
}
