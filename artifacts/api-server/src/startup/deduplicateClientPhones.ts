import { db } from "../db";
import { pool } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time migration: enforce one client per phone number per store.
 *
 * Steps (all idempotent — safe to run on every restart):
 *  1. Add store_id column to client_phones (backfilled from clients).
 *  2. For each (phone_number_e164, store_id) group with multiple clients:
 *       a. Keep the oldest client (lowest id).
 *       b. Re-point appointments.customer_id from duplicates → keeper.
 *       c. Soft-delete (archive) the duplicate client rows.
 *       d. Delete the duplicate client_phones rows.
 *  3. Add a UNIQUE index on client_phones(phone_number_e164, store_id).
 */
export async function deduplicateClientPhones(): Promise<void> {
  try {
    // ── Step 1: add store_id column if missing ──────────────────────────────
    await db.execute(sql`
      ALTER TABLE client_phones
        ADD COLUMN IF NOT EXISTS store_id integer;
    `);

    // Backfill store_id for any rows that don't have it yet
    const backfilled = await db.execute(sql`
      UPDATE client_phones cp
      SET    store_id = c.store_id
      FROM   clients c
      WHERE  cp.client_id = c.id
        AND  cp.store_id IS NULL;
    `);
    const backfilledCount = (backfilled as any).rowCount ?? 0;
    if (backfilledCount > 0) {
      console.log(`[dedup] backfilled store_id on ${backfilledCount} client_phones row(s)`);
    }

    // ── Step 2: find & collapse duplicate clients ───────────────────────────
    const dupsResult = await db.execute(sql`
      SELECT
        cp.phone_number_e164,
        cp.store_id,
        MIN(cp.client_id)                                          AS keeper_id,
        array_agg(cp.client_id ORDER BY cp.client_id)             AS all_ids
      FROM client_phones cp
      WHERE cp.store_id IS NOT NULL
      GROUP BY cp.phone_number_e164, cp.store_id
      HAVING COUNT(DISTINCT cp.client_id) > 1;
    `);

    const dupGroups: Array<{ keeper_id: number; all_ids: number[] }> =
      (dupsResult as any).rows ?? [];

    let archivedCount = 0;
    let relinkedCount = 0;

    for (const group of dupGroups) {
      const keeperId = Number(group.keeper_id);
      const duplicateIds = group.all_ids
        .map(Number)
        .filter((id: number) => id !== keeperId);

      if (!duplicateIds.length) continue;

      // Use pool.query directly — the pg driver serialises JS arrays to
      // PostgreSQL arrays natively, which Drizzle's sql`` template does not.
      const apptResult = await pool.query(
        `UPDATE appointments SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      );
      relinkedCount += apptResult.rowCount ?? 0;

      // Re-point other FK tables (all errors swallowed — tables may not exist)
      await pool.query(
        `UPDATE loyalty_transactions SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE reviews SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE google_reviews SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE intake_form_responses SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE waitlist SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE gift_cards SET purchased_by_customer_id = $1 WHERE purchased_by_customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE gift_cards SET recipient_customer_id = $1 WHERE recipient_customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE sms_log SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE client_intelligence SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});
      await pool.query(
        `UPDATE intelligence_interventions SET customer_id = $1 WHERE customer_id = ANY($2::int[])`,
        [keeperId, duplicateIds]
      ).catch(() => {});

      // Remove duplicate client_phones rows
      await pool.query(
        `DELETE FROM client_phones WHERE client_id = ANY($1::int[])`,
        [duplicateIds]
      );

      // Soft-delete (archive) the duplicate client rows
      const archiveResult = await pool.query(
        `UPDATE clients SET archived_at = NOW() WHERE id = ANY($1::int[]) AND archived_at IS NULL`,
        [duplicateIds]
      );
      archivedCount += archiveResult.rowCount ?? 0;
    }

    if (dupGroups.length > 0) {
      console.log(
        `[dedup] collapsed ${dupGroups.length} duplicate phone group(s): ` +
        `${archivedCount} client(s) archived, ${relinkedCount} appointment(s) re-linked`
      );
    }

    // ── Step 3: add unique index (phone + store) ────────────────────────────
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS client_phones_phone_store_unique
      ON client_phones(phone_number_e164, store_id);
    `);

  } catch (err: any) {
    console.error("[dedup] deduplicateClientPhones failed:", err.message);
  }
}
