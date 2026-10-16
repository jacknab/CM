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

// ── House calls (Solo plan, plans/solo-work-places-and-approval.md) ─────────────────────────────────
// A house call keeps its professional's travel time free before and after it, so another booking can't be
// placed right up against a visit across town. Every free-time check uses these two helpers.

/** The business's travel time around each house call, in minutes (0 when it doesn't do house calls). */
export async function getHouseCallTravelMinutes(storeId: number | null | undefined): Promise<number> {
  if (!storeId) return 0;
  try {
    const { rows } = await pool.query("SELECT house_calls, house_call_travel_minutes FROM locations WHERE id = $1 LIMIT 1", [storeId]);
    return rows[0]?.house_calls ? Math.max(0, Number(rows[0].house_call_travel_minutes) || 0) : 0;
  } catch {
    return 0;
  }
}

/** The time an existing appointment really holds: a house call adds its travel time on both sides. */
export function heldWindow(a: { date: Date | string; visitAt?: string | null }, heldMin: number, travelMin: number): { start: Date; minutes: number } {
  const start = new Date(a.date);
  if (a.visitAt !== "client" || travelMin <= 0 || heldMin <= 0) return { start, minutes: heldMin };
  return { start: new Date(start.getTime() - travelMin * 60_000), minutes: heldMin + 2 * travelMin };
}

/** The time a new booking needs free: a house call needs its travel time on both sides too. */
export function neededWindow(start: Date, end: Date, visitAt: string | null | undefined, travelMin: number): { start: Date; end: Date } {
  if (visitAt !== "client" || travelMin <= 0) return { start, end };
  return { start: new Date(start.getTime() - travelMin * 60_000), end: new Date(end.getTime() + travelMin * 60_000) };
}
