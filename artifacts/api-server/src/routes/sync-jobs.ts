import { db } from "../db";
import { appointments, waitlist } from "@shared/schema";
import { eq, and, lt, ne, isNotNull } from "drizzle-orm";
import { logAuditEntry } from "../lib/sync-audit";
import { broadcastSyncEvent } from "../notifications";

const JOB_INTERVAL_MS = 5 * 60 * 1000;

function hasTimeOverlap(
  aStart: Date, aDuration: number,
  bStart: Date, bDuration: number
): boolean {
  const aEnd = new Date(aStart.getTime() + aDuration * 60_000);
  const bEnd = new Date(bStart.getTime() + bDuration * 60_000);
  return aStart < bEnd && bStart < aEnd;
}

async function reconcileStore(storeId: number): Promise<void> {
  const ACTIVE_STATUSES = ["pending", "started", "checked_in"];
  // Statuses that mean "the client is physically here / being served right
  // now" — these must never be silently auto-cancelled by this background
  // job. A walk-in that just checked in at the kiosk is definitionally real,
  // even if it happens to overlap with a stale/duplicate pending booking.
  const PRESENT_STATUSES = new Set(["checked_in", "started"]);
  const activeApts = await db
    .select({
      id: appointments.id,
      customerId: appointments.customerId,
      staffId: appointments.staffId,
      date: appointments.date,
      duration: appointments.duration,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.storeId, storeId),
        ne(appointments.status, "cancelled"),
        ne(appointments.status, "completed"),
        ne(appointments.status, "no-show"),
        ne(appointments.status, "no_show"),
        isNotNull(appointments.customerId)
      )
    );

  const cancelledIds = new Set<number>();

  for (let i = 0; i < activeApts.length; i++) {
    for (let j = i + 1; j < activeApts.length; j++) {
      const a = activeApts[i];
      const b = activeApts[j];
      if (!a.customerId || a.customerId !== b.customerId) continue;
      if (cancelledIds.has(a.id) || cancelledIds.has(b.id)) continue;

      const overlap = hasTimeOverlap(
        new Date(a.date), a.duration,
        new Date(b.date), b.duration
      );
      if (!overlap) continue;

      const aPresent = PRESENT_STATUSES.has(String(a.status));
      const bPresent = PRESENT_STATUSES.has(String(b.status));

      // If both sides are "present" (checked in / in progress), this isn't a
      // simple duplicate we can safely auto-resolve — leave it for staff and
      // just log it for visibility.
      if (aPresent && bPresent) {
        console.warn(
          `[sync-jobs] store=${storeId} appointments ${a.id} and ${b.id} both present and overlapping — skipping auto-cancel, needs manual review`
        );
        continue;
      }

      // Prefer to cancel the non-present side. A checked-in/started
      // appointment means the client is standing at the salon right now, so
      // it must win over a booking nobody has arrived for yet — regardless
      // of which row was created more recently.
      const toCancel = aPresent ? b : bPresent ? a : (a.id > b.id ? a : b);
      const kept = toCancel.id === a.id ? b : a;
      cancelledIds.add(toCancel.id);

      await db
        .update(appointments)
        .set({
          status: "cancelled",
          cancellationReason: "[auto-reconciled] Duplicate booking detected and merged",
        })
        .where(eq(appointments.id, toCancel.id));

      broadcastSyncEvent({ type: "booking_deleted", storeId, appointmentId: toCancel.id });

      logAuditEntry({
        ts: Date.now(),
        storeId,
        deviceId: "server-job",
        actionType: "RECONCILE_DUPLICATE",
        status: "reconciled",
        entityId: toCancel.id,
        resolution: `Cancelled duplicate appointment ${toCancel.id} (duplicate of ${kept.id})`,
      });

      console.log(
        `[sync-jobs] store=${storeId} cancelled duplicate appointment ${toCancel.id}`
      );
    }
  }

  const STALE_CUTOFF = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleWalkins = await db
    .select({ id: waitlist.id, createdAt: waitlist.createdAt })
    .from(waitlist)
    .where(
      and(
        eq(waitlist.storeId, storeId),
        eq(waitlist.status, "waiting"),
        lt(waitlist.createdAt, STALE_CUTOFF)
      )
    );

  for (const wk of staleWalkins) {
    await db
      .update(waitlist)
      .set({ status: "cancelled" })
      .where(eq(waitlist.id, wk.id));

    logAuditEntry({
      ts: Date.now(),
      storeId,
      deviceId: "server-job",
      actionType: "RECONCILE_STALE_WALKIN",
      status: "reconciled",
      entityId: wk.id,
      resolution: `Cancelled stale walk-in ${wk.id} (waiting since ${wk.createdAt?.toISOString() ?? "unknown"})`,
    });
  }

  if (staleWalkins.length > 0) {
    console.log(`[sync-jobs] store=${storeId} cleared ${staleWalkins.length} stale walk-in(s)`);
  }
}

export async function runReconciliationJob(): Promise<void> {
  try {
    const storeRows = await db
      .selectDistinct({ storeId: appointments.storeId })
      .from(appointments)
      .where(isNotNull(appointments.storeId));

    for (const { storeId } of storeRows) {
      if (!storeId) continue;
      await reconcileStore(storeId).catch((err) =>
        console.error(`[sync-jobs] Reconciliation failed for store ${storeId}:`, err)
      );
    }
  } catch (err) {
    console.error("[sync-jobs] Job error:", err);
  }
}

export function startReconciliationScheduler(): void {
  console.log("[sync-jobs] Background reconciliation scheduler started (interval=5min)");
  setTimeout(() => {
    runReconciliationJob().catch(console.error);
    setInterval(() => runReconciliationJob().catch(console.error), JOB_INTERVAL_MS);
  }, 30_000);
}
