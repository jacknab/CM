/**
 * Enqueue appointment mutations for outbound calendar sync.
 *
 * Called (fire-and-forget) from storage.createAppointment / updateAppointment /
 * deleteAppointment. Cheap no-op for the vast majority of stores that have no
 * calendar_connections — we check first and skip the insert entirely.
 *
 * Drained by workers/calendarSyncWorker.ts on the scheduler instance.
 */

import { pool } from "../../db";

async function storeHasConnection(storeId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM calendar_connections
      WHERE store_id = $1 AND status = 'active' AND sync_direction IN ('both','outbound')
      LIMIT 1`,
    [storeId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Queue an upsert (create or update) of the appointment's mirrored remote event. */
export async function enqueueAppointmentUpsert(
  appointmentId: number,
  storeId: number | null | undefined,
  staffId: number | null | undefined,
): Promise<void> {
  try {
    if (!appointmentId || !storeId) return;
    if (!(await storeHasConnection(storeId))) return;
    await pool.query(
      `INSERT INTO calendar_sync_outbox (appointment_id, store_id, staff_id, op)
       VALUES ($1, $2, $3, 'upsert')`,
      [appointmentId, storeId, staffId ?? null],
    );
  } catch (err: any) {
    console.error(`[calendar-sync] enqueue upsert failed (appt ${appointmentId}):`, err?.message);
  }
}

/**
 * Queue removal of the mirrored remote event(s). Must be called BEFORE the
 * appointment row is deleted, so the appointment_external_events mappings are
 * still readable — their (connectionId, externalEventId) pairs are copied onto
 * the outbox row.
 */
export async function enqueueAppointmentDelete(appointmentId: number): Promise<void> {
  try {
    if (!appointmentId) return;
    const r = await pool.query<{ connection_id: number; external_event_id: string }>(
      `SELECT connection_id, external_event_id FROM appointment_external_events WHERE appointment_id = $1`,
      [appointmentId],
    );
    if (!r.rows.length) return; // never mirrored anywhere — nothing to delete

    const ctx = await pool.query<{ store_id: number; staff_id: number | null }>(
      `SELECT store_id, staff_id FROM appointments WHERE id = $1`,
      [appointmentId],
    );

    const refs = r.rows.map((m) => ({ connectionId: m.connection_id, externalEventId: m.external_event_id }));
    await pool.query(
      `INSERT INTO calendar_sync_outbox (appointment_id, external_refs, store_id, staff_id, op)
       VALUES ($1, $2::jsonb, $3, $4, 'delete')`,
      [
        appointmentId,
        JSON.stringify(refs),
        ctx.rows[0]?.store_id ?? 0,
        ctx.rows[0]?.staff_id ?? null,
      ],
    );
  } catch (err: any) {
    console.error(`[calendar-sync] enqueue delete failed (appt ${appointmentId}):`, err?.message);
  }
}
