/**
 * Low-balance alert scheduler.
 *
 * Runs daily at 9 AM. Checks all active stores:
 *   - Platform credits < store's autoRefillThreshold (default $5)  → send "low balance" alert
 *   - Platform credits < $0.00                                      → send "critical / negative" alert
 *
 * The low-balance threshold is the store's configured autoRefillThreshold
 * (the value at which auto-refill would trigger). If not set, falls back to $5.
 *
 * Also exports `maybeSendLowBalanceAlert()` for real-time triggers from
 * costMeter (after AI call deductions) and admin credit adjustments.
 *
 * Tracks sent alerts in-memory (per store, per day) to avoid duplicate emails.
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { sendLowBalanceAlertEmail } from "../lib/systemEmails";

// In-memory dedup: { "storeId_key" → "YYYY-MM-DD" }
const alertsSentToday = new Map<string, string>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasAlertedToday(storeId: number, key: string): boolean {
  return alertsSentToday.get(`${storeId}_${key}`) === todayStr();
}

function markAlerted(storeId: number, key: string): void {
  alertsSentToday.set(`${storeId}_${key}`, todayStr());
}

const PLATFORM_CREDITS_CRITICAL   = 0.0; // dollars — urgent (negative balance)
const PLATFORM_CREDITS_LOW_DEFAULT = 5.0; // dollars — fallback when no threshold set

/**
 * Real-time check called immediately after any platform credit deduction.
 * Fires an email alert when the balance crosses the store's auto-refill threshold,
 * at most once per day.
 *
 * @param storeId    The store that just had credits deducted
 * @param newBalance The balance after deduction (may be negative)
 */
export async function maybeSendLowBalanceAlert(storeId: number, newBalance: number): Promise<void> {
  try {
    // Critical alert: balance has gone negative (crosses $0)
    if (newBalance < PLATFORM_CREDITS_CRITICAL && !hasAlertedToday(storeId, "platform_critical")) {
      await sendLowBalanceAlertEmail(storeId, "platform_credits", newBalance, true).catch(() => {});
      markAlerted(storeId, "platform_critical");
      console.log(`[LowBalance] Critical alert sent — store=${storeId} balance=$${newBalance.toFixed(2)}`);
      return;
    }

    if (newBalance >= PLATFORM_CREDITS_CRITICAL) {
      // Look up the store's configured auto-refill threshold to use as the low-balance watermark
      const [row] = await db
        .select({ autoRefillThreshold: locations.autoRefillThreshold })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);

      const threshold = parseFloat(row?.autoRefillThreshold ?? String(PLATFORM_CREDITS_LOW_DEFAULT));

      if (newBalance < threshold && !hasAlertedToday(storeId, "platform_low")) {
        await sendLowBalanceAlertEmail(storeId, "platform_credits", newBalance, false).catch(() => {});
        markAlerted(storeId, "platform_low");
        console.log(`[LowBalance] Low-balance alert sent — store=${storeId} balance=$${newBalance.toFixed(2)} threshold=$${threshold.toFixed(2)}`);
      }
    }
  } catch (err: any) {
    console.error("[LowBalance] maybeSendLowBalanceAlert failed:", err.message);
  }
}

export async function runLowBalanceCheck(): Promise<void> {
  try {
    const stores = await db
      .select({
        id:                  locations.id,
        platformCredits:     sql<string>`platform_credits`,
        autoRefillThreshold: locations.autoRefillThreshold,
      })
      .from(locations)
      .where(eq(locations.accountStatus as any, "Active"));

    let alerts = 0;

    for (const store of stores) {
      const platform  = parseFloat(store.platformCredits ?? "0");
      const threshold = parseFloat(store.autoRefillThreshold ?? String(PLATFORM_CREDITS_LOW_DEFAULT));

      // Critical: negative balance (blocks new AI calls and SMS wallet)
      if (platform < PLATFORM_CREDITS_CRITICAL && !hasAlertedToday(store.id, "platform_critical")) {
        await sendLowBalanceAlertEmail(store.id, "platform_credits", platform, true).catch(() => {});
        markAlerted(store.id, "platform_critical");
        alerts++;
      // Low: below the store's configured auto-refill threshold (but not yet negative)
      } else if (platform >= PLATFORM_CREDITS_CRITICAL && platform < threshold && !hasAlertedToday(store.id, "platform_low")) {
        await sendLowBalanceAlertEmail(store.id, "platform_credits", platform, false).catch(() => {});
        markAlerted(store.id, "platform_low");
        alerts++;
      }
    }

    if (alerts > 0) {
      console.log(`[LowBalance] Sent ${alerts} low-balance alert(s)`);
    }
  } catch (err: any) {
    console.error("[LowBalance] Check failed:", err.message);
  }
}

function msUntilNextRun(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startLowBalanceScheduler(): void {
  const scheduleNext = () => {
    const ms = msUntilNextRun();
    console.log(`[LowBalance] Next check in ${Math.round(ms / 3600000)}h`);
    setTimeout(() => {
      runLowBalanceCheck();
      setInterval(runLowBalanceCheck, 24 * 60 * 60 * 1000);
    }, ms);
  };
  scheduleNext();
}
