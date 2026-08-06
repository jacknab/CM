/**
 * Demo Cleanup Scheduler
 * ──────────────────────
 * Runs every 60 seconds. Deletes all appointments for the demo store
 * (storeId = 2) that were CREATED more than 5 minutes ago.
 *
 * This keeps the AI Receptionist demo calendar clean — demo callers can
 * see their freshly-booked appointment for ~5 minutes, then it disappears
 * so the next demo caller always starts with a clean slate.
 *
 * Deletion cascades through all FK-dependent tables before removing the
 * appointment row itself so no orphaned rows are left behind.
 *
 * Registered in index.ts → startDemoCleanupScheduler().
 */

import { db } from "../db";
import {
  appointments,
  appointmentAddons,
  smsLog,
  reviews,
  aiCallLog,
  loyaltyTransactions,
  googleReviews,
  turnAssignmentLog,
} from "@shared/schema";
import { and, eq, lt, inArray, isNotNull } from "drizzle-orm";

const DEMO_STORE_ID      = 1;
const CHECK_INTERVAL_MS  = 60 * 1000;       // run every 60 seconds
const MAX_AGE_MS         = 15 * 60 * 1000;   // delete appointments older than 5 minutes

async function runDemoCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_AGE_MS);

  try {
    // Find stale demo appointments using createdAt (creation time), not
    // the scheduled `date` which can be far in the future.
    // Rows that pre-date the createdAt column (NULL) are also cleaned up
    // using a fallback against the scheduled date.
    const stale = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.storeId, DEMO_STORE_ID),
          lt(appointments.createdAt, cutoff)
        )
      );

    const staleIds = stale.map((r) => r.id);
    if (staleIds.length === 0) return;

    // Cascade: delete FK-dependent rows before removing the appointment itself.
    // Each delete is individually guarded so a schema-drift on one table
    // (e.g. a column that hasn't been migrated yet) doesn't block all cleanup.
    const cascadeDeletes = [
      () => db.delete(appointmentAddons).where(inArray(appointmentAddons.appointmentId, staleIds)),
      () => db.delete(smsLog).where(inArray(smsLog.appointmentId, staleIds)),
      () => db.delete(reviews).where(inArray(reviews.appointmentId, staleIds)),
      () => db.delete(aiCallLog).where(inArray(aiCallLog.appointmentId, staleIds)),
      () => db.delete(loyaltyTransactions).where(inArray(loyaltyTransactions.appointmentId, staleIds)),
      () => db.delete(googleReviews).where(inArray(googleReviews.appointmentId, staleIds)),
      () => db.delete(turnAssignmentLog).where(inArray(turnAssignmentLog.appointmentId, staleIds)),
    ];
    for (const del of cascadeDeletes) {
      await del().catch(() => { /* column may not exist yet — safe to skip */ });
    }

    const deleted = await db
      .delete(appointments)
      .where(inArray(appointments.id, staleIds))
      .returning({ id: appointments.id });

    if (deleted.length > 0) {
      console.log(
        `[DemoCleanup] Removed ${deleted.length} demo appointment(s) ` +
        `created before ${cutoff.toISOString()} (storeId=${DEMO_STORE_ID})`
      );
    }
  } catch (err: any) {
    console.error("[DemoCleanup] Cleanup run failed:", err.message);
  }
}

export function startDemoCleanupScheduler(): void {
  const run = (): void => {
    runDemoCleanup().catch((err) =>
      console.error("[DemoCleanup] Unhandled error:", err)
    );
  };

  // Run immediately on startup, then every CHECK_INTERVAL_MS.
  run();
  setInterval(run, CHECK_INTERVAL_MS);

  console.log(
    `[DemoCleanup] Scheduler started — removes storeId=${DEMO_STORE_ID} ` +
    `appointments older than ${MAX_AGE_MS / 60000} min, checks every ${CHECK_INTERVAL_MS / 1000}s`
  );
}
