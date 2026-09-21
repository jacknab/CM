import { pool } from "../db";

/** Allowed values for calendar_settings.buffer_minutes. */
export const BUFFER_OPTIONS = [0, 5, 10, 15] as const;

/** Clamp anything stored / passed in to a supported buffer (0 when unknown). */
export function normalizeBufferMinutes(v: unknown): number {
  const n = Number(v);
  return (BUFFER_OPTIONS as readonly number[]).includes(n) ? n : 0;
}

/** The store's "time between appointments" in minutes. Never throws — a lookup failure means no buffer. */
export async function getBufferMinutes(storeId: number | null | undefined): Promise<number> {
  if (!storeId) return 0;
  try {
    const { rows } = await pool.query("SELECT buffer_minutes FROM calendar_settings WHERE store_id = $1 LIMIT 1", [storeId]);
    return normalizeBufferMinutes(rows[0]?.buffer_minutes);
  } catch {
    return 0;
  }
}

/**
 * Does [newStart, newEnd) clash with an existing appointment once each is held for `bufferMin`
 * after it ends? Symmetric, so the gap is enforced on both sides of every appointment.
 */
export function clashesWithBuffer(
  existingStart: Date | number,
  existingDurationMin: number,
  newStart: Date | number,
  newEnd: Date | number,
  bufferMin: number,
): boolean {
  const b = bufferMin * 60_000;
  const eStart = new Date(existingStart).getTime();
  const eEnd = eStart + existingDurationMin * 60_000;
  return eStart < new Date(newEnd).getTime() + b && eEnd + b > new Date(newStart).getTime();
}
