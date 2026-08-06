/**
 * Session Guard — Duration limits, idle detection, concurrency control.
 *
 * Enforces per-salon safety limits:
 *   - Max call duration (default: 12 min) — Req 3, 4
 *   - Idle timeout (default: 30s no activity) — Req 7
 *   - Max concurrent calls per salon (default: 3) — Req 3
 *   - Daily call minutes cap — Req 3
 *   - Live cost cap (monthly spend guard) — Req 3, 8
 *
 * When a limit is breached, calls `terminateFn` with a reason string.
 * The AI receptionist injects a graceful farewell before hanging up.
 */

import { db } from "../db";
import { salonUsageLimits, callUsageRecords } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { safetyGate } from "./safetyGate";
import { costMeter } from "./costMeter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalonLimits {
  maxCallDurationMin:  number;
  maxDailyMinutes:     number;
  maxMonthlyCostUsd:   number;
  maxConcurrentCalls:  number;
  idleTimeoutSeconds:  number;
}

export const DEFAULT_LIMITS: SalonLimits = {
  maxCallDurationMin:  parseInt(process.env.DEFAULT_MAX_CALL_DURATION_MIN  || "12",  10),
  maxDailyMinutes:     parseInt(process.env.DEFAULT_MAX_DAILY_MINUTES      || "480", 10),
  maxMonthlyCostUsd:   parseFloat(process.env.DEFAULT_MAX_MONTHLY_COST_USD || "200"),
  maxConcurrentCalls:  parseInt(process.env.DEFAULT_MAX_CONCURRENT_CALLS   || "3",   10),
  idleTimeoutSeconds:  parseInt(process.env.DEFAULT_IDLE_TIMEOUT_SECONDS   || "30",  10),
};

interface ActiveGuard {
  callSid:     string;
  storeId:     number;
  startedAt:   Date;
  lastActivity: Date;
  limits:      SalonLimits;
  interval:    ReturnType<typeof setInterval>;
  terminated:  boolean;
  terminateFn: (reason: string, aiMessage: string) => void;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class SessionGuardService {
  /** callSid → active guard */
  private readonly guards   = new Map<string, ActiveGuard>();
  /** storeId → active call count */
  private readonly callCounts = new Map<number, number>();

  // ── Limits CRUD ─────────────────────────────────────────────────────────────

  async getLimits(storeId: number): Promise<SalonLimits> {
    try {
      const [row] = await db
        .select()
        .from(salonUsageLimits)
        .where(eq(salonUsageLimits.storeId, storeId))
        .limit(1);

      if (!row) return { ...DEFAULT_LIMITS };
      return {
        maxCallDurationMin:  row.maxCallDurationMin,
        maxDailyMinutes:     row.maxDailyMinutes,
        maxMonthlyCostUsd:   parseFloat(row.maxMonthlyCostUsd ?? "200"),
        maxConcurrentCalls:  row.maxConcurrentCalls,
        idleTimeoutSeconds:  row.idleTimeoutSeconds,
      };
    } catch {
      return { ...DEFAULT_LIMITS };
    }
  }

  async setLimits(storeId: number, limits: Partial<SalonLimits>): Promise<void> {
    await db
      .insert(salonUsageLimits)
      .values({
        storeId,
        maxCallDurationMin:  limits.maxCallDurationMin  ?? DEFAULT_LIMITS.maxCallDurationMin,
        maxDailyMinutes:     limits.maxDailyMinutes     ?? DEFAULT_LIMITS.maxDailyMinutes,
        maxMonthlyCostUsd:   String(limits.maxMonthlyCostUsd   ?? DEFAULT_LIMITS.maxMonthlyCostUsd),
        maxConcurrentCalls:  limits.maxConcurrentCalls  ?? DEFAULT_LIMITS.maxConcurrentCalls,
        idleTimeoutSeconds:  limits.idleTimeoutSeconds  ?? DEFAULT_LIMITS.idleTimeoutSeconds,
      })
      .onConflictDoUpdate({
        target: salonUsageLimits.storeId,
        set: {
          ...(limits.maxCallDurationMin  !== undefined && { maxCallDurationMin:  limits.maxCallDurationMin }),
          ...(limits.maxDailyMinutes     !== undefined && { maxDailyMinutes:     limits.maxDailyMinutes }),
          ...(limits.maxMonthlyCostUsd   !== undefined && { maxMonthlyCostUsd:   String(limits.maxMonthlyCostUsd) }),
          ...(limits.maxConcurrentCalls  !== undefined && { maxConcurrentCalls:  limits.maxConcurrentCalls }),
          ...(limits.idleTimeoutSeconds  !== undefined && { idleTimeoutSeconds:  limits.idleTimeoutSeconds }),
          updatedAt: new Date(),
        },
      });
  }

  // ── Concurrency ──────────────────────────────────────────────────────────────

  getActiveCalls(storeId: number): number {
    return this.callCounts.get(storeId) ?? 0;
  }

  private incrementCalls(storeId: number): void {
    this.callCounts.set(storeId, (this.callCounts.get(storeId) ?? 0) + 1);
  }

  private decrementCalls(storeId: number): void {
    const n = (this.callCounts.get(storeId) ?? 1) - 1;
    this.callCounts.set(storeId, Math.max(0, n));
  }

  // ── Guard lifecycle ──────────────────────────────────────────────────────────

  async onCallStart(
    callSid: string,
    storeId: number,
    terminateFn: (reason: string, aiMessage: string) => void,
  ): Promise<{ allowed: boolean; reason: string }> {
    const limits = await this.getLimits(storeId);

    // Concurrency check
    if (this.getActiveCalls(storeId) >= limits.maxConcurrentCalls) {
      return {
        allowed: false,
        reason: `Concurrent call limit reached (${limits.maxConcurrentCalls}) for store ${storeId}`,
      };
    }

    // Daily minutes check
    const dailyUsed = await this.getDailyMinutesUsed(storeId);
    if (dailyUsed >= limits.maxDailyMinutes) {
      safetyGate.setManualBlock(storeId, true, `Daily call minutes cap reached: ${dailyUsed} / ${limits.maxDailyMinutes} min`);
      return {
        allowed: false,
        reason: `Daily call minutes cap reached (${dailyUsed.toFixed(1)} / ${limits.maxDailyMinutes} min)`,
      };
    }

    // Monthly cost check
    const monthlyCost = await this.getMonthlyCost(storeId);
    if (monthlyCost >= limits.maxMonthlyCostUsd) {
      safetyGate.setManualBlock(storeId, true, `Monthly spend cap reached: $${monthlyCost.toFixed(2)} / $${limits.maxMonthlyCostUsd}`);
      return {
        allowed: false,
        reason: `Monthly spend cap reached ($${monthlyCost.toFixed(2)} / $${limits.maxMonthlyCostUsd})`,
      };
    }

    this.incrementCalls(storeId);
    this.startGuard(callSid, storeId, limits, terminateFn);
    return { allowed: true, reason: "" };
  }

  updateActivity(callSid: string): void {
    const g = this.guards.get(callSid);
    if (g) g.lastActivity = new Date();
  }

  endGuard(callSid: string): void {
    const g = this.guards.get(callSid);
    if (!g) return;
    clearInterval(g.interval);
    this.guards.delete(callSid);
    this.decrementCalls(g.storeId);
  }

  // ── Aggregations (for daily/monthly caps) ────────────────────────────────────

  async getDailyMinutesUsed(storeId: number): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    try {
      const [row] = await db
        .select({ total: sql<string>`COALESCE(SUM(duration_seconds), 0)` })
        .from(callUsageRecords)
        .where(
          and(
            eq(callUsageRecords.storeId, storeId),
            gte(callUsageRecords.createdAt, todayStart)
          )
        );
      return parseFloat(row?.total ?? "0") / 60;
    } catch {
      return 0;
    }
  }

  async getMonthlyCost(storeId: number): Promise<number> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    try {
      const [row] = await db
        .select({ total: sql<string>`COALESCE(SUM(total_est_cost), 0)` })
        .from(callUsageRecords)
        .where(
          and(
            eq(callUsageRecords.storeId, storeId),
            gte(callUsageRecords.createdAt, monthStart)
          )
        );
      return parseFloat(row?.total ?? "0");
    } catch {
      return 0;
    }
  }

  // ── Private: tick loop ───────────────────────────────────────────────────────

  private startGuard(
    callSid: string,
    storeId: number,
    limits: SalonLimits,
    terminateFn: (reason: string, aiMessage: string) => void,
  ): void {
    const guard: ActiveGuard = {
      callSid,
      storeId,
      startedAt:    new Date(),
      lastActivity: new Date(),
      limits,
      terminated:   false,
      terminateFn,
      interval:     undefined as any,
    };

    const CHECK_INTERVAL_MS = 15_000; // check every 15 seconds

    guard.interval = setInterval(() => {
      if (guard.terminated) {
        clearInterval(guard.interval);
        return;
      }

      const now = Date.now();
      const elapsedMin   = (now - guard.startedAt.getTime()) / 60_000;
      const idleSec      = (now - guard.lastActivity.getTime()) / 1000;
      const liveCostUsd  = costMeter.getLiveSnapshot(callSid)?.estimatedCostUsd ?? 0;

      // 1. Max call duration
      if (elapsedMin >= limits.maxCallDurationMin) {
        this.terminate(guard, "duration_limit",
          "I want to make sure we get everything wrapped up — let me have someone from the front desk follow up with you shortly to finalize the details."
        );
        return;
      }

      // 2. Idle detection
      if (idleSec >= limits.idleTimeoutSeconds) {
        this.terminate(guard, "idle_timeout",
          "It seems the line has gone quiet. If you need anything, please don't hesitate to call back. Have a wonderful day!"
        );
        return;
      }

      // 3. Live cost anomaly (2× monthly limit / 30 days / 10 calls safety factor)
      const anomalyThreshold = (limits.maxMonthlyCostUsd / 30 / 10) * 2;
      if (liveCostUsd > anomalyThreshold) {
        console.warn(`[SessionGuard] Cost anomaly — callSid=${callSid} live cost $${liveCostUsd.toFixed(4)} > threshold $${anomalyThreshold.toFixed(4)}`);
        this.terminate(guard, "cost_anomaly",
          "Let me have someone from the team follow up with you shortly."
        );
        return;
      }

      // 4. Approaching duration limit — throttle verbosity at 80%
      if (elapsedMin >= limits.maxCallDurationMin * 0.8) {
        console.log(`[SessionGuard] store=${storeId} call approaching limit (${elapsedMin.toFixed(1)}/${limits.maxCallDurationMin}min) — throttle mode`);
      }
    }, CHECK_INTERVAL_MS);

    this.guards.set(callSid, guard);
    console.log(`[SessionGuard] Guard started — callSid=${callSid} store=${storeId} maxDuration=${limits.maxCallDurationMin}min idle=${limits.idleTimeoutSeconds}s concurrent=${this.getActiveCalls(storeId)}/${limits.maxConcurrentCalls}`);
  }

  private terminate(guard: ActiveGuard, reason: string, aiMessage: string): void {
    if (guard.terminated) return;
    guard.terminated = true;
    clearInterval(guard.interval);
    console.warn(`[SessionGuard] 🛑 Terminating call — callSid=${guard.callSid} store=${guard.storeId} reason=${reason}`);
    guard.terminateFn(reason, aiMessage);
  }
}

export const sessionGuard = new SessionGuardService();
