/**
 * Per-salon circuit breaker — Safety Gate Layer.
 *
 * Tracks health metrics for each salon and blocks live call routing
 * if error rates, latency, or failure thresholds are exceeded.
 *
 * Thresholds (all configurable via env vars):
 *   SAFETY_MAX_WS_ERRORS      max WebSocket errors per window (default 3)
 *   SAFETY_MAX_TOOL_FAILURES  max consecutive tool failures (default 5)
 *   SAFETY_MAX_LATENCY_MS     max avg tool latency in ms (default 2500)
 *   SAFETY_WINDOW_MS          rolling metric window in ms (default 1 hour)
 */

const MAX_WS_ERRORS     = parseInt(process.env.SAFETY_MAX_WS_ERRORS     || "3",    10);
const MAX_TOOL_FAILURES = parseInt(process.env.SAFETY_MAX_TOOL_FAILURES  || "5",    10);
const MAX_LATENCY_MS    = parseInt(process.env.SAFETY_MAX_LATENCY_MS     || "2500", 10);
const WINDOW_MS         = parseInt(process.env.SAFETY_WINDOW_MS          || String(60 * 60 * 1000), 10);

interface TimestampedValue {
  value: number;
  at: number;
}

interface SalonGateState {
  blocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  manualBlock: boolean;
  wsErrors: TimestampedValue[];
  toolLatencies: TimestampedValue[];
  consecutiveToolFailures: number;
  totalCalls: number;
  successfulCalls: number;
  lastCallAt: string | null;
  firstCallMode: boolean;
  firstCallCompleted: boolean;
  liveCallsEnabled: boolean;
}

function freshState(): SalonGateState {
  return {
    blocked:                  false,
    blockedReason:            null,
    blockedAt:                null,
    manualBlock:              false,
    wsErrors:                 [],
    toolLatencies:            [],
    consecutiveToolFailures:  0,
    totalCalls:               0,
    successfulCalls:          0,
    lastCallAt:               null,
    firstCallMode:            true,
    firstCallCompleted:       false,
    liveCallsEnabled:         false,
  };
}

function pruneOldEntries(arr: TimestampedValue[]): TimestampedValue[] {
  const cutoff = Date.now() - WINDOW_MS;
  return arr.filter((e) => e.at >= cutoff);
}

function avg(arr: TimestampedValue[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, e) => s + e.value, 0) / arr.length;
}

class SalonSafetyGate {
  private readonly store = new Map<number, SalonGateState>();

  private get(storeId: number): SalonGateState {
    if (!this.store.has(storeId)) this.store.set(storeId, freshState());
    return this.store.get(storeId)!;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  isBlocked(storeId: number): boolean {
    const s = this.get(storeId);
    return s.blocked || !s.liveCallsEnabled;
  }

  blockReason(storeId: number): string {
    const s = this.get(storeId);
    if (!s.liveCallsEnabled) return "Live calls not enabled for this salon — run preflight first";
    if (s.blocked)            return s.blockedReason ?? "Safety gate triggered";
    return "";
  }

  enableCalls(storeId: number): void {
    const s = this.get(storeId);
    s.liveCallsEnabled = true;
    s.blocked = false;
    s.blockedReason = null;
    s.manualBlock = false;
  }

  disableCalls(storeId: number, reason: string): void {
    const s = this.get(storeId);
    s.liveCallsEnabled = false;
    s.blocked = true;
    s.blockedReason = reason;
    s.blockedAt = new Date().toISOString();
    s.manualBlock = true;
  }

  /** Force-open (or force-close) the circuit for a specific salon. */
  setManualBlock(storeId: number, block: boolean, reason?: string): void {
    const s = this.get(storeId);
    s.blocked    = block;
    s.manualBlock = block;
    s.blockedReason = block ? (reason ?? "Manual block") : null;
    s.blockedAt  = block ? new Date().toISOString() : null;
  }

  recordWsError(storeId: number, message?: string): void {
    const s = this.get(storeId);
    s.wsErrors = pruneOldEntries(s.wsErrors);
    s.wsErrors.push({ value: 1, at: Date.now() });
    console.warn(`[SafetyGate] store=${storeId} WS error recorded (total in window: ${s.wsErrors.length}) — ${message ?? ""}`);
    this._evaluate(storeId);
  }

  recordToolCall(storeId: number, latencyMs: number, success: boolean): void {
    const s = this.get(storeId);
    s.toolLatencies = pruneOldEntries(s.toolLatencies);
    s.toolLatencies.push({ value: latencyMs, at: Date.now() });

    if (success) {
      s.consecutiveToolFailures = 0;
    } else {
      s.consecutiveToolFailures++;
      console.warn(`[SafetyGate] store=${storeId} tool failure #${s.consecutiveToolFailures}`);
    }
    this._evaluate(storeId);
  }

  recordCallStart(storeId: number): void {
    const s = this.get(storeId);
    s.totalCalls++;
    s.lastCallAt = new Date().toISOString();
  }

  recordCallSuccess(storeId: number): void {
    const s = this.get(storeId);
    s.successfulCalls++;
    if (!s.firstCallCompleted) {
      s.firstCallCompleted = true;
      s.firstCallMode = false;
      console.log(`[SafetyGate] store=${storeId} ✅ First call completed — switching to normal mode`);
    }
  }

  isFirstCallMode(storeId: number): boolean {
    return this.get(storeId).firstCallMode;
  }

  /** Return status for every salon that has had at least one call this process lifetime. */
  getAllStatuses(): Record<string, unknown>[] {
    return Array.from(this.store.keys()).map((id) => this.getStatus(id));
  }

  getStatus(storeId: number): Record<string, unknown> {
    const s = this.get(storeId);
    const wsErrors = pruneOldEntries(s.wsErrors);
    const latencies = pruneOldEntries(s.toolLatencies);
    return {
      storeId,
      liveCallsEnabled:        s.liveCallsEnabled,
      blocked:                 s.blocked,
      blockedReason:           s.blockedReason,
      blockedAt:               s.blockedAt,
      manualBlock:             s.manualBlock,
      firstCallMode:           s.firstCallMode,
      firstCallCompleted:      s.firstCallCompleted,
      metrics: {
        wsErrorsInWindow:       wsErrors.length,
        consecutiveToolFailures: s.consecutiveToolFailures,
        avgToolLatencyMs:       Math.round(avg(latencies)),
        latencySamples:         latencies.length,
        totalCalls:             s.totalCalls,
        successfulCalls:        s.successfulCalls,
        lastCallAt:             s.lastCallAt,
      },
      thresholds: {
        maxWsErrors:     MAX_WS_ERRORS,
        maxToolFailures: MAX_TOOL_FAILURES,
        maxLatencyMs:    MAX_LATENCY_MS,
        windowMs:        WINDOW_MS,
      },
    };
  }

  // ── Circuit evaluation ────────────────────────────────────────────────────

  private _evaluate(storeId: number): void {
    const s = this.get(storeId);
    if (s.manualBlock) return; // Respect manual overrides

    const wsErrors  = pruneOldEntries(s.wsErrors);
    const latencies = pruneOldEntries(s.toolLatencies);
    const avgLat    = avg(latencies);

    if (wsErrors.length >= MAX_WS_ERRORS) {
      this._trip(storeId, `WebSocket error rate exceeded: ${wsErrors.length} errors in rolling window`);
      return;
    }
    if (s.consecutiveToolFailures >= MAX_TOOL_FAILURES) {
      this._trip(storeId, `Consecutive tool failures exceeded: ${s.consecutiveToolFailures}`);
      return;
    }
    if (latencies.length >= 3 && avgLat > MAX_LATENCY_MS) {
      this._trip(storeId, `AI response latency exceeded: avg ${Math.round(avgLat)}ms > ${MAX_LATENCY_MS}ms threshold`);
      return;
    }

    // Auto-recover: if previously tripped (not manually) and now within thresholds
    if (s.blocked && !s.manualBlock) {
      s.blocked = false;
      s.blockedReason = null;
      s.blockedAt = null;
      console.log(`[SafetyGate] store=${storeId} ✅ Circuit auto-recovered — resuming call routing`);
    }
  }

  private _trip(storeId: number, reason: string): void {
    const s = this.get(storeId);
    if (s.blocked) return; // Already blocked
    s.blocked = true;
    s.blockedReason = reason;
    s.blockedAt = new Date().toISOString();
    console.error(`[SafetyGate] 🚨 store=${storeId} circuit TRIPPED — ${reason}`);
  }
}

export const safetyGate = new SalonSafetyGate();
