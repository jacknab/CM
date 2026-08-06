/**
 * staffColorUtils.ts
 *
 * Enforces the business rule: one calendar color per staff member per store.
 * Import `claimStaffColor` anywhere a staff color is written so duplicates
 * can never accumulate in the database.
 */

import { db } from "../db";
import { staff } from "@shared/schema";
import { and, eq, ne } from "drizzle-orm";

/**
 * Atomically claims `color` for `staffId` within `storeId`.
 *
 * Before the color is saved, every other staff member in the same store
 * who currently holds that exact color value has their color cleared to NULL.
 * This guarantees at most one owner per color at any point in time.
 *
 * Call this BEFORE the insert/update that persists the color.
 *
 * @param storeId  - The store the staff member belongs to.
 * @param staffId  - The staff member receiving the color.
 * @param color    - The hex color string being assigned (e.g. "#3b82f6").
 */
export async function claimStaffColor(
  storeId: number,
  staffId: number,
  color: string
): Promise<void> {
  if (!color) return;
  await db
    .update(staff)
    .set({ color: null })
    .where(
      and(
        eq(staff.storeId, storeId),
        eq(staff.color, color),
        ne(staff.id, staffId)
      )
    );
}

/**
 * Audit + repair: scans all staff in `storeId` and resolves any duplicate
 * color assignments that may have slipped in before this rule was enforced.
 *
 * For each color that appears more than once, the staff member with the
 * lowest `id` (earliest created) keeps the color; all others are cleared.
 *
 * Safe to run at any time — it is idempotent and read-modify-writes only the
 * affected rows.
 *
 * @returns The number of color conflicts resolved.
 */
export async function repairDuplicateStaffColors(storeId: number): Promise<number> {
  // Fetch all staff in this store that have a color assigned.
  const rows = await db
    .select({ id: staff.id, color: staff.color })
    .from(staff)
    .where(and(eq(staff.storeId, storeId)));

  // Group by color value.
  const colorMap = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.color) continue;
    const key = row.color.toLowerCase();
    const existing = colorMap.get(key) ?? [];
    existing.push(row.id);
    colorMap.set(key, existing);
  }

  let fixed = 0;
  for (const [, ids] of colorMap) {
    if (ids.length <= 1) continue;
    // Sort ascending — keep lowest id (first created), clear the rest.
    ids.sort((a, b) => a - b);
    const [, ...duplicates] = ids;
    for (const dupId of duplicates) {
      await db.update(staff).set({ color: null }).where(eq(staff.id, dupId));
      fixed++;
    }
  }

  return fixed;
}
