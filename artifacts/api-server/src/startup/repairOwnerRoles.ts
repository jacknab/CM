import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * One-time-on-boot repair: if a user owns a store (locations.user_id matches
 * users.id) but their role got mislabeled as "staff" (e.g., by a legacy
 * staff-link flow), promote them back to "owner" so they can access their
 * own store admin pages.
 */
export async function repairOwnerRoles(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE users
      SET role = 'owner'
      WHERE role = 'staff'
        AND id IN (SELECT user_id FROM locations WHERE user_id IS NOT NULL)
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) {
      console.log(`[startup] repairOwnerRoles: promoted ${count} mislabeled store owner(s) back to "owner".`);
    }
  } catch (err) {
    console.error("[startup] repairOwnerRoles failed:", err);
  }
}
