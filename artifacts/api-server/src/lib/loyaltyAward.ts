import { db } from "../db";
import { storeSettings, loyaltyTransactions, clients } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Single source of truth for awarding loyalty points on a completed,
 * paid appointment. Every code path that can mark an appointment
 * "completed" with a payment amount (the web PATCH route, Stripe Terminal
 * capture, and offline-sync reconciliation) must call this — previously
 * only the PATCH route did, so Terminal (card/Tap to Pay) checkouts and
 * offline-queued checkouts silently never earned points even with loyalty
 * enabled. Never throws — a loyalty failure must never block a checkout.
 */
export async function awardLoyaltyForCompletion(opts: {
  storeId: number;
  customerId: number | null | undefined;
  appointmentId: number;
  totalPaid: number;
}): Promise<void> {
  const { storeId, customerId, appointmentId, totalPaid } = opts;
  if (!customerId || !(totalPaid > 0)) return;

  try {
    const [ssRow] = await db.select({ preferences: storeSettings.preferences })
      .from(storeSettings).where(eq(storeSettings.storeId, storeId));
    const lp = ssRow?.preferences ? (JSON.parse(ssRow.preferences as string).loyalty ?? {}) : {};
    const loyaltyEnabled = lp.enabled !== false;
    if (!loyaltyEnabled) return;

    const pointsPerDollar = Number(lp.pointsPerDollar) > 0 ? Number(lp.pointsPerDollar) : 1;
    const pointsEarned = Math.round(totalPaid * pointsPerDollar);

    await db.insert(loyaltyTransactions).values({
      storeId,
      customerId,
      appointmentId,
      type: "earn",
      points: pointsEarned,
      description: `Earned for appointment #${appointmentId} (${totalPaid.toFixed(2)} @ ${pointsPerDollar}pt/$)`,
    });

    const [cust] = await db.select({ loyaltyPoints: clients.loyaltyPoints })
      .from(clients).where(eq(clients.id, customerId)).limit(1);
    const newTotal = (cust?.loyaltyPoints ?? 0) + pointsEarned;
    await db.update(clients).set({ loyaltyPoints: newTotal }).where(eq(clients.id, customerId));

    console.log(`[Loyalty] Awarded ${pointsEarned} pts to customer ${customerId} (appointment ${appointmentId})`);
  } catch (loyaltyErr) {
    console.error("[Loyalty] Auto-earn error:", loyaltyErr);
  }
}
