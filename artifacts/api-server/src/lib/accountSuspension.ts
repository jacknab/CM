/**
 * A salon whose account is suspended (unpaid) or closed keeps its data — the owner can still open their account,
 * clients, catalogue and reports — but these stop until it is paid: /nail and /calendar (AccountStatusGate on the
 * website, the /api block in routes.ts), the online booking page and website, Autumn, and every SMS the salon
 * sends (sendSms). The owner's own sign-in codes are not the salon's texts and still go out (sendTwilioSms).
 */
import { pool } from "../db";

const CACHE_MS = 30_000;
const cache = new Map<number, { stopped: boolean; at: number }>();

/** True when the salon's account is suspended, locked or cancelled. A failed check never blocks. */
export async function isAccountStopped(storeId: number): Promise<boolean> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.stopped;
  try {
    const { rows } = await pool.query(`SELECT lower(coalesce(account_status, 'active')) AS status FROM locations WHERE id = $1`, [storeId]);
    const stopped = ["suspended", "locked", "canceled", "cancelled"].includes(String(rows[0]?.status ?? "active"));
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
