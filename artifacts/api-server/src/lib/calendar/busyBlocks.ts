/**
 * Read-side of external calendar sync: personal/external events pulled in from a
 * staff member's Google/Outlook calendar that should block Certxa bookings.
 *
 * Populated by workers/calendarSyncWorker.ts. Consumed by the booking engine and
 * the precomputed slot builder. Any failure here degrades to "no blocks" — a
 * calendar-sync hiccup must never take down booking.
 */

import { pool } from "../../db";

export interface BusyBlock {
  startsAt: Date;
  endsAt: Date;
  title: string | null;
}

/**
 * External "busy" events overlapping [from, to) for one staff member, across all
 * that staff member's active inbound-enabled connections in the store.
 */
export async function getStaffBusyBlocks(
  storeId: number,
  staffId: number | null | undefined,
  from: Date,
  to: Date,
): Promise<BusyBlock[]> {
  if (!staffId) return [];
  try {
    const r = await pool.query<{ starts_at: Date; ends_at: Date; title: string | null }>(
      `SELECT b.starts_at, b.ends_at, b.title
         FROM external_busy_blocks b
         JOIN calendar_connections c ON c.id = b.connection_id
        WHERE b.staff_id = $1
          AND c.store_id = $2
          AND c.status = 'active'
          AND c.sync_direction IN ('both', 'inbound')
          AND b.status <> 'cancelled'
          AND b.starts_at < $4
          AND b.ends_at   > $3`,
      [staffId, storeId, from, to],
    );
    return r.rows.map((x) => ({
      startsAt: new Date(x.starts_at),
      endsAt: new Date(x.ends_at),
      title: x.title,
    }));
  } catch (err: any) {
    console.error("[calendar-sync] getStaffBusyBlocks failed:", err?.message);
    return [];
  }
}

/**
 * All external busy blocks in [from, to) for a whole store, grouped by staff id.
 * One query — used by the precomputed slot builder.
 */
export async function getStoreBusyBlocksByStaff(
  storeId: number,
  from: Date,
  to: Date,
): Promise<Map<number, BusyBlock[]>> {
  const out = new Map<number, BusyBlock[]>();
  try {
    const r = await pool.query<{ staff_id: number; starts_at: Date; ends_at: Date; title: string | null }>(
      `SELECT b.staff_id, b.starts_at, b.ends_at, b.title
         FROM external_busy_blocks b
         JOIN calendar_connections c ON c.id = b.connection_id
        WHERE c.store_id = $1
          AND b.staff_id IS NOT NULL
          AND c.status = 'active'
          AND c.sync_direction IN ('both', 'inbound')
          AND b.status <> 'cancelled'
          AND b.starts_at < $3
          AND b.ends_at   > $2`,
      [storeId, from, to],
    );
    for (const x of r.rows) {
      const list = out.get(x.staff_id) ?? [];
      list.push({ startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at), title: x.title });
      out.set(x.staff_id, list);
    }
  } catch (err: any) {
    console.error("[calendar-sync] getStoreBusyBlocksByStaff failed:", err?.message);
  }
  return out;
}

/** First block whose interval overlaps [start, end), or null. */
export function findBusyOverlap(blocks: BusyBlock[], start: Date, end: Date): BusyBlock | null {
  const s = start.getTime();
  const e = end.getTime();
  for (const b of blocks) {
    if (b.startsAt.getTime() < e && b.endsAt.getTime() > s) return b;
  }
  return null;
}

/** True if `instant` falls inside any block (point-in-interval test). */
export function isInstantBusy(blocks: BusyBlock[], instant: Date): boolean {
  const t = instant.getTime();
  return blocks.some((b) => t >= b.startsAt.getTime() && t < b.endsAt.getTime());
}
