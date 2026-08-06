/**
 * Owner Activity Feed
 *
 * Lightweight event log powering the "Owner Feed" live-updating widget on the
 * salon dashboard. Every notable real-time moment (check-in, service
 * completed, payment processed, AI booking, walk-in assignment, VIP arrival,
 * review received, new booking) gets a row here, then triggers the existing
 * dashboard WebSocket broadcast so connected owners see it appear instantly
 * without refreshing.
 */

import { db } from "../db";
import { storeActivityEvents } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { triggerDashboardBroadcast } from "../routes/dashboardWS";

export type ActivityEventType =
  | "check_in"
  | "service_completed"
  | "payment"
  | "ai_booking"
  | "walk_in"
  | "vip_arrival"
  | "review"
  | "new_booking"
  | "call_answered"
  | "low_stock"
  // Staff management
  | "staff_added"
  | "staff_deactivated"
  | "staff_role_changed"
  // Staff timeclock
  | "staff_clocked_in"
  | "staff_clocked_out"
  // Subscription / billing
  | "subscription_upgraded"
  | "subscription_downgraded"
  | "subscription_cancelled"
  | "subscription_reactivated"
  | "payment_succeeded"
  | "payment_failed"
  | "sms_credits_purchased"
  | "wallet_deposit";

export interface LogActivityEventInput {
  storeId: number;
  eventType: ActivityEventType;
  message: string;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert an activity event and immediately notify any connected dashboard
 * WebSocket clients for that store. Never throws — a failure to log an
 * activity event (e.g. transient DB hiccup) must never break the underlying
 * business action that triggered it (check-in, payment, booking, etc.), so
 * every call site can fire-and-forget this without a try/catch of its own.
 */
export async function logActivityEvent(input: LogActivityEventInput): Promise<void> {
  try {
    await db.insert(storeActivityEvents).values({
      storeId: input.storeId,
      eventType: input.eventType,
      message: input.message,
      amount: input.amount != null ? String(input.amount) : null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error("[activityFeed] Failed to log event:", err);
    return;
  }
  // Fire the existing debounced dashboard broadcast so the Owner Feed and
  // "What's Happening Right Now" widgets update live for anyone watching.
  triggerDashboardBroadcast(input.storeId);
}

export interface ActivityFeedItem {
  id: number;
  eventType: string;
  message: string;
  amount: number | null;
  createdAt: string;
}

/** Most recent N activity events for a store, newest first. */
export async function getRecentActivity(
  storeId: number,
  limit = 20,
): Promise<ActivityFeedItem[]> {
  const rows = await db
    .select()
    .from(storeActivityEvents)
    .where(eq(storeActivityEvents.storeId, storeId))
    .orderBy(desc(storeActivityEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    message: r.message,
    amount: r.amount != null ? parseFloat(r.amount as any) : null,
    createdAt: (r.createdAt as Date).toISOString(),
  }));
}
