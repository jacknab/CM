import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * One-time-on-boot migration: seed sms_allowance from the legacy sms_tokens
 * field for stores that already have tokens but haven't been migrated yet.
 * Safe to run on every boot — only touches rows where sms_allowance = 0
 * AND sms_tokens > 0 so it never clobbers already-migrated values.
 */
export async function migrateSmsAllowance(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE locations
      SET sms_allowance = sms_tokens
      WHERE sms_allowance = 0 AND sms_tokens > 0
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) {
      console.log(`[startup] migrateSmsAllowance: migrated ${count} store(s) from sms_tokens → sms_allowance`);
    }
  } catch (err: any) {
    console.error("[startup] migrateSmsAllowance failed:", err.message);
  }
}
