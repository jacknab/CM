// Client merge, the database side, in pieces the route runs inside ONE db.transaction:
//   lockMergeClientsTx   — re-checks every id inside the transaction (same store, not archived, no duplicates, winner not a loser)
//                          and locks the client rows in id order, so two merges touching the same clients run one after the other.
//   moveClientRecordsTx  — moves one loser's records to the winner (everything the current route moves, plus Quick Notes and
//                          haircut formulas). Loyalty stays in mergeLoyaltyTx, unchanged, called by the route just before this.
//   recalcWinnerTotalsTx — the winner's visit/spend totals, as today.
// Any error inside the transaction rolls all of it back: nothing is half-merged.
import { sql } from "drizzle-orm";

// Same shape as loyaltyAward.ts's Tx; kept structural so this file has no import of ../db.
type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: any[] }> };

export type MergeCheck =
  | { ok: true; winnerId: number; loserIds: number[] }
  | { ok: false; status: 400 | 403 | 409; message: string };

const toId = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function lockMergeClientsTx(tx: Tx, storeId: number, rawWinner: unknown, rawLosers: unknown, actor: string | null): Promise<MergeCheck> {
  const winnerId = toId(rawWinner);
  const loserIds = Array.isArray(rawLosers) ? rawLosers.map(toId) : [];
  if (!winnerId || loserIds.length === 0 || loserIds.some((id) => id === null)) {
    return { ok: false, status: 400, message: "winnerId and loserIds[] required" };
  }
  const losers = loserIds as number[];
  if (new Set(losers).size !== losers.length || losers.includes(winnerId)) {
    return { ok: false, status: 400, message: "Each client can be merged once, and not into itself" };
  }
  const allIds = [winnerId, ...losers];

  // Who did it, for the haircut formula audit rows written by the triggers (transaction-local).
  await tx.execute(sql`SELECT set_config('certxa.actor', ${actor ?? ""}, true)`);

  // Lock in id order (no deadlock between two merges), only this store's rows.
  const rows = (await tx.execute(sql`
    SELECT id, archived_at FROM clients
     WHERE id IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)}) AND store_id = ${storeId}
     ORDER BY id FOR UPDATE`)).rows;
  if (rows.length !== allIds.length) {
    return { ok: false, status: 403, message: "One or more clients not found in this store" };
  }
  if (rows.some((r) => r.archived_at != null)) {
    return { ok: false, status: 409, message: "One of these clients was already merged or archived" };
  }
  return { ok: true, winnerId, loserIds: losers };
}

export async function moveClientRecordsTx(tx: Tx, storeId: number, winnerId: number, loserId: number): Promise<void> {
  // Tickets first: haircut history checks a ticket's client, so the tickets must already be the winner's.
  await tx.execute(sql`UPDATE appointments SET customer_id = ${winnerId} WHERE customer_id = ${loserId} AND store_id = ${storeId}`);

  await tx.execute(sql`
    INSERT INTO client_emails (client_id, email_address, is_primary, marketing_opt_in)
    SELECT ${winnerId}, email_address, false, marketing_opt_in FROM client_emails WHERE client_id = ${loserId}
    ON CONFLICT DO NOTHING`);
  await tx.execute(sql`
    INSERT INTO client_phones (client_id, store_id, phone_number_e164, display_phone, phone_type, sms_opt_in, is_primary)
    SELECT ${winnerId}, store_id, phone_number_e164, display_phone, phone_type, sms_opt_in, false FROM client_phones WHERE client_id = ${loserId}
    ON CONFLICT DO NOTHING`);
  await tx.execute(sql`UPDATE client_notes SET client_id = ${winnerId} WHERE client_id = ${loserId} AND store_id = ${storeId}`);
  await tx.execute(sql`
    INSERT INTO client_tag_relationships (client_id, tag_id)
    SELECT ${winnerId}, tag_id FROM client_tag_relationships WHERE client_id = ${loserId}
    ON CONFLICT DO NOTHING`);
  await tx.execute(sql`
    INSERT INTO client_custom_field_values (client_id, custom_field_id, field_value)
    SELECT ${winnerId}, custom_field_id, field_value FROM client_custom_field_values
     WHERE client_id = ${loserId}
       AND custom_field_id NOT IN (SELECT custom_field_id FROM client_custom_field_values WHERE client_id = ${winnerId})
    ON CONFLICT DO NOTHING`);
  // No .catch() here: inside a transaction a failed statement aborts the whole transaction anyway (25P02),
  // so swallowing the error only hid the real cause. The table exists in every environment today.
  await tx.execute(sql`UPDATE kiosk_checkins SET client_id = ${winnerId} WHERE client_id = ${loserId} AND store_id = ${storeId}`);

  // NEW — Quick Notes follow the client (they stayed on the archived loser before, so the winner's
  // "last visit" notes went missing). One note per ticket is unchanged, so this can't conflict.
  await tx.execute(sql`UPDATE client_quick_notes SET client_id = ${winnerId}, updated_at = now() WHERE client_id = ${loserId} AND store_id = ${storeId}`);

  // NEW — haircut formulas move to the winner; their versions follow by ON UPDATE CASCADE (history rows are never
  // rewritten by hand). If the winner already has an everyday formula, the loser's becomes a named, non-default one
  // so the one-default-per-client rule holds. The audit trigger writes one formula_client_changed row per formula.
  await tx.execute(sql`
    UPDATE client_haircut_formulas f
       SET client_id = ${winnerId},
           is_default = f.is_default AND NOT EXISTS (
             SELECT 1 FROM client_haircut_formulas w
              WHERE w.store_id = ${storeId} AND w.client_id = ${winnerId} AND w.is_default AND NOT w.is_archived),
           label = CASE WHEN f.is_default AND f.label IS NULL AND EXISTS (
             SELECT 1 FROM client_haircut_formulas w
              WHERE w.store_id = ${storeId} AND w.client_id = ${winnerId} AND w.is_default AND NOT w.is_archived)
             THEN 'From merged client #' || ${loserId}::text ELSE f.label END,
           updated_at = now()
     WHERE f.client_id = ${loserId} AND f.store_id = ${storeId}`);

  await tx.execute(sql`UPDATE clients SET archived_at = NOW() WHERE id = ${loserId} AND store_id = ${storeId}`);
}

export async function recalcWinnerTotalsTx(tx: Tx, storeId: number, winnerId: number): Promise<void> {
  await tx.execute(sql`
    UPDATE clients SET
      total_visits = COALESCE((
        SELECT COUNT(*) FROM appointments WHERE customer_id = ${winnerId} AND store_id = ${storeId} AND status = 'completed'), 0),
      total_spent_cents = COALESCE((
        SELECT ROUND(SUM(CAST(total_paid AS DECIMAL(10,2))) * 100)::int FROM appointments
         WHERE customer_id = ${winnerId} AND store_id = ${storeId} AND status = 'completed'), 0),
      updated_at = NOW()
    WHERE id = ${winnerId} AND store_id = ${storeId}`);
}
