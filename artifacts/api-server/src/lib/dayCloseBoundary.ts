import { pool } from "../db";

/** Most recent session closed by Day Close, excluding ordinary drawer closes. */
export async function getLastDayCloseAt(storeId: number, drawerId?: number | null): Promise<Date | null> {
  const { rows } = await pool.query<{ closed: Date | string | null }>(
    `SELECT MAX(s.closed_at AT TIME ZONE 'UTC') AS closed
       FROM cash_drawer_sessions s
      WHERE s.store_id = $1
        AND s.status = 'closed'
        AND s.closed_at IS NOT NULL
        AND ($2::boolean OR s.drawer_id IS NOT DISTINCT FROM $3::integer)
        AND (
          EXISTS (
            SELECT 1 FROM drawer_actions close_action
             WHERE close_action.session_id = s.id
               AND close_action.type = 'close_drawer'
               AND close_action.reason = 'Day Close'
          )
          OR EXISTS (
            SELECT 1 FROM cash_drawer_sessions next_session
             WHERE next_session.store_id = s.store_id
               AND next_session.drawer_id IS NOT DISTINCT FROM s.drawer_id
               AND next_session.opened_at = s.closed_at
               AND EXISTS (
                 SELECT 1 FROM drawer_actions open_action
                  WHERE open_action.session_id = next_session.id
                    AND open_action.type = 'open_drawer'
                    AND open_action.reason = 'Auto-opened by Day Close'
               )
          )
        )`,
    [storeId, drawerId === undefined, drawerId ?? null],
  );
  return rows[0]?.closed ? new Date(rows[0].closed) : null;
}
