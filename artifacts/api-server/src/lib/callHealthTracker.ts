/**
 * Call Health Tracker — Live Monitoring + Auto-Healing Engine
 *
 * Maintains an in-memory registry of every active call session.
 * Computes a real-time health score (0–100) for each call:
 *
 *   100  perfect flow
 *   <70  degraded  (slow responses, recent silence events)
 *   <50  high risk (tool failures, audio gaps)
 *   <30  auto-heal triggered
 *
 * The tracker is a pure in-memory singleton — it does NOT write to the DB.
 * Silence events that require persistence are handled by SilenceWatchdog.flushToDB().
 *
 * Usage (inside createCallSession):
 *   callHealthTracker.startCall(...)
 *   callHealthTracker.recordAiAudio(callSid)
 *   callHealthTracker.recordUserInput(callSid)
 *   callHealthTracker.recordResponseStart(callSid)
 *   callHealthTracker.recordResponseEnd(callSid)
 *   callHealthTracker.recordTool(callSid, name, latencyMs, success)
 *   callHealthTracker.recordSilenceEvent(callSid, layer, durationMs, action)
 *   callHealthTracker.recordFillerInjection(callSid, layer)
 *   callHealthTracker.recordWsStatus(callSid, open)
 *   callHealthTracker.recordAutoHeal(callSid, detail)
 *   callHealthTracker.recordFailure(callSid, category, detail)
 *   callHealthTracker.endCall(callSid, outcome)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FailureCategory =
  | "openai_delay"
  | "websocket_failure"
  | "tool_timeout"
  | "state_machine_stall"
  | "db_latency"
  | "session_setup_failure"
  | "unknown_anomaly";

export interface HealthEvent {
  at: number;
  type:
    | "audio"
    | "user_input"
    | "response_start"
    | "response_end"
    | "tool_start"
    | "tool_end"
    | "tool_fail"
    | "silence"
    | "filler"
    | "heal"
    | "ws_open"
    | "ws_close"
    | "failure"
    | "call_end";
  detail: string;
  layer?: string;
}

export interface FailureRecord {
  at: number;
  category: FailureCategory;
  detail: string;
  autoHealed: boolean;
}

export interface CallHealthSession {
  callSid:   string | null;
  storeId:   number;
  callLogId: number | null;
  startedAt: number;
  endedAt:   number | null;
  outcome:   string | null;

  // ── Realtime timestamps ───────────────────────────────────────────────────
  lastAiAudioAt:    number;
  lastUserInputAt:  number;
  lastActivityAt:   number;

  // ── Response latency ─────────────────────────────────────────────────────
  responseStartedAt:          number | null;
  lastResponseLatencyMs:      number | null;
  recentResponseLatencies:    number[];       // rolling last 5

  // ── Tool tracking ─────────────────────────────────────────────────────────
  currentTool:          string | null;
  toolStartedAt:        number | null;
  toolSuccesses:        number;
  toolFailures:         number;
  recentToolLatencies:  number[];              // rolling last 5

  // ── Silence / healing ─────────────────────────────────────────────────────
  silenceEvents:   number;
  fillerInjections: number;
  autoHealEvents:  number;
  lastHealAt:      number | null;

  // ── WebSocket ──────────────────────────────────────────────────────────────
  wsOpen: boolean;

  // ── Event log (last 40 events, newest last) ────────────────────────────────
  events: HealthEvent[];

  // ── Failure log ───────────────────────────────────────────────────────────
  failures: FailureRecord[];

  // ── Health score snapshot (recomputed on each read) ───────────────────────
  healthScore: number;

  /** Friendly risk label derived from healthScore */
  riskLevel: "stable" | "degraded" | "high_risk" | "critical";
}

export interface LiveCallsSnapshot {
  activeCalls: LiveCallSummary[];
  totalActive: number;
  atRisk:      number;      // healthScore < 50
  critical:    number;      // healthScore < 30
  fetchedAt:   string;
}

export interface LiveCallSummary extends Omit<CallHealthSession, "events" | "failures"> {
  healthScore:   number;
  riskLevel:     "stable" | "degraded" | "high_risk" | "critical";
  recentEvents:  HealthEvent[];    // last 10
  recentFailures: FailureRecord[];
  durationSeconds: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_EVENTS         = 40;
const MAX_FAILURES       = 20;
const ROLLING_WINDOW_N   = 5;
const SCORE_WINDOW_MS    = 90_000;   // only count events in the last 90s for scoring
const HEAL_COOLDOWN_MS   = 15_000;   // minimum gap between auto-heal triggers

// ─── CallHealthTracker ────────────────────────────────────────────────────────

class CallHealthTracker {
  private readonly sessions = new Map<string, CallHealthSession>();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  startCall(opts: {
    callSid:   string | null;
    storeId:   number;
    callLogId: number | null;
  }): void {
    const key = opts.callSid ?? `anon-${Date.now()}`;
    const now = Date.now();
    const session: CallHealthSession = {
      callSid:   opts.callSid,
      storeId:   opts.storeId,
      callLogId: opts.callLogId,
      startedAt: now,
      endedAt:   null,
      outcome:   null,

      lastAiAudioAt:   now,
      lastUserInputAt: now,
      lastActivityAt:  now,

      responseStartedAt:       null,
      lastResponseLatencyMs:   null,
      recentResponseLatencies: [],

      currentTool:         null,
      toolStartedAt:       null,
      toolSuccesses:       0,
      toolFailures:        0,
      recentToolLatencies: [],

      silenceEvents:    0,
      fillerInjections: 0,
      autoHealEvents:   0,
      lastHealAt:       null,

      wsOpen: true,

      events:   [],
      failures: [],

      healthScore: 100,
      riskLevel:   "stable",
    };
    this.sessions.set(key, session);
    this.log(session, "ws_open", "Call session started");
  }

  updateCallLogId(callSid: string | null, callLogId: number): void {
    const s = this.get(callSid);
    if (s) s.callLogId = callLogId;
  }

  endCall(callSid: string | null, outcome: string): void {
    const s = this.get(callSid);
    if (!s) return;
    s.endedAt = Date.now();
    s.outcome = outcome;
    s.wsOpen  = false;
    this.log(s, "call_end", `Ended — outcome=${outcome}`);
    // Keep session for 5 minutes for post-call inspection
    setTimeout(() => {
      const key = callSid ?? `anon-${s.startedAt}`;
      this.sessions.delete(key);
    }, 5 * 60_000);
  }

  // ── Metric recorders ──────────────────────────────────────────────────────

  recordAiAudio(callSid: string | null): void {
    const s = this.get(callSid);
    if (!s) return;
    const now = Date.now();
    s.lastAiAudioAt   = now;
    s.lastActivityAt  = now;
  }

  recordUserInput(callSid: string | null): void {
    const s = this.get(callSid);
    if (!s) return;
    const now = Date.now();
    s.lastUserInputAt = now;
    s.lastActivityAt  = now;
    this.log(s, "user_input", "User speech committed");
  }

  recordResponseStart(callSid: string | null): void {
    const s = this.get(callSid);
    if (!s) return;
    s.responseStartedAt = Date.now();
    s.lastActivityAt    = Date.now();
    this.log(s, "response_start", "response.create sent");
  }

  recordResponseEnd(callSid: string | null): void {
    const s = this.get(callSid);
    if (!s) return;
    const now = Date.now();
    s.lastActivityAt = now;
    if (s.responseStartedAt) {
      const latencyMs = now - s.responseStartedAt;
      s.lastResponseLatencyMs   = latencyMs;
      s.responseStartedAt       = null;
      s.recentResponseLatencies = [...s.recentResponseLatencies.slice(-(ROLLING_WINDOW_N - 1)), latencyMs];
      this.log(s, "response_end", `response.done — latency=${latencyMs}ms`);

      if (latencyMs > 3_000) {
        this.recordFailure(callSid, "openai_delay", `Response latency ${latencyMs}ms exceeded 3s threshold`);
      }
    }
  }

  recordToolStart(callSid: string | null, toolName: string): void {
    const s = this.get(callSid);
    if (!s) return;
    s.currentTool    = toolName;
    s.toolStartedAt  = Date.now();
    s.lastActivityAt = Date.now();
    this.log(s, "tool_start", `Tool started: ${toolName}`);
  }

  recordToolEnd(callSid: string | null, toolName: string, success: boolean): void {
    const s = this.get(callSid);
    if (!s) return;
    const now = Date.now();
    s.lastActivityAt = now;
    const latencyMs  = s.toolStartedAt ? now - s.toolStartedAt : 0;
    s.currentTool    = null;
    s.toolStartedAt  = null;

    s.recentToolLatencies = [...s.recentToolLatencies.slice(-(ROLLING_WINDOW_N - 1)), latencyMs];

    if (success) {
      s.toolSuccesses++;
      this.log(s, "tool_end", `Tool done: ${toolName} — ${latencyMs}ms`);
    } else {
      s.toolFailures++;
      this.log(s, "tool_fail", `Tool failed: ${toolName} — ${latencyMs}ms`);
      this.recordFailure(callSid, latencyMs >= 4_500 ? "tool_timeout" : "unknown_anomaly",
        `Tool "${toolName}" failed after ${latencyMs}ms`);
    }
  }

  recordSilenceEvent(callSid: string | null, layer: string, durationMs: number, action: string): void {
    const s = this.get(callSid);
    if (!s) return;
    s.silenceEvents++;
    s.lastActivityAt = Date.now();
    this.log(s, "silence", `${layer} — ${durationMs}ms → ${action}`, layer);

    // Determine failure category from layer
    const cat: FailureCategory =
      layer.startsWith("L4") ? "websocket_failure" :
      layer.startsWith("L5") ? "state_machine_stall" :
      "openai_delay";
    this.recordFailure(callSid, cat, `Silence detected by ${layer} — ${durationMs}ms`);

    // Auto-heal: if score is critical and we haven't healed recently
    this.maybeAutoHeal(s, layer);
  }

  recordFillerInjection(callSid: string | null, layer: string): void {
    const s = this.get(callSid);
    if (!s) return;
    s.fillerInjections++;
    s.lastActivityAt = Date.now();
    this.log(s, "filler", `Filler injected by ${layer}`, layer);
  }

  recordWsStatus(callSid: string | null, open: boolean): void {
    const s = this.get(callSid);
    if (!s) return;
    s.wsOpen = open;
    s.lastActivityAt = Date.now();
    this.log(s, open ? "ws_open" : "ws_close", open ? "WebSocket opened" : "WebSocket closed");
    if (!open) {
      this.recordFailure(callSid, "websocket_failure", "OpenAI WebSocket closed unexpectedly");
    }
  }

  recordAutoHeal(callSid: string | null, detail: string): void {
    const s = this.get(callSid);
    if (!s) return;
    s.autoHealEvents++;
    s.lastHealAt     = Date.now();
    s.lastActivityAt = Date.now();
    this.log(s, "heal", `Auto-heal: ${detail}`);
  }

  recordFailure(callSid: string | null, category: FailureCategory, detail: string): void {
    const s = this.get(callSid);
    if (!s) return;
    const rec: FailureRecord = { at: Date.now(), category, detail, autoHealed: false };
    s.failures = [...s.failures.slice(-(MAX_FAILURES - 1)), rec];
  }

  // ── Health score ──────────────────────────────────────────────────────────

  computeHealthScore(callSid: string | null): number {
    const s = this.get(callSid);
    if (!s) return 0;
    return this.score(s);
  }

  // ── Live ops snapshot ─────────────────────────────────────────────────────

  getActiveCalls(): LiveCallsSnapshot {
    const now = Date.now();
    const summaries: LiveCallSummary[] = [];

    for (const [, s] of this.sessions) {
      if (s.endedAt) continue;   // skip ended calls
      const hs = this.score(s);
      s.healthScore = hs;
      s.riskLevel   = riskLevel(hs);

      summaries.push({
        callSid:   s.callSid,
        storeId:   s.storeId,
        callLogId: s.callLogId,
        startedAt: s.startedAt,
        endedAt:   s.endedAt,
        outcome:   s.outcome,

        lastAiAudioAt:   s.lastAiAudioAt,
        lastUserInputAt: s.lastUserInputAt,
        lastActivityAt:  s.lastActivityAt,

        responseStartedAt:       s.responseStartedAt,
        lastResponseLatencyMs:   s.lastResponseLatencyMs,
        recentResponseLatencies: s.recentResponseLatencies,

        currentTool:         s.currentTool,
        toolStartedAt:       s.toolStartedAt,
        toolSuccesses:       s.toolSuccesses,
        toolFailures:        s.toolFailures,
        recentToolLatencies: s.recentToolLatencies,

        silenceEvents:    s.silenceEvents,
        fillerInjections: s.fillerInjections,
        autoHealEvents:   s.autoHealEvents,
        lastHealAt:       s.lastHealAt,

        wsOpen: s.wsOpen,

        healthScore: hs,
        riskLevel:   s.riskLevel,

        recentEvents:   s.events.slice(-10),
        recentFailures: s.failures.slice(-5),

        durationSeconds: Math.floor((now - s.startedAt) / 1000),
      });
    }

    const atRisk   = summaries.filter((c) => c.healthScore < 50).length;
    const critical = summaries.filter((c) => c.healthScore < 30).length;

    return {
      activeCalls: summaries.sort((a, b) => a.healthScore - b.healthScore),
      totalActive: summaries.length,
      atRisk,
      critical,
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Get a single call's full detail (including full event log) */
  getCallDetail(callSid: string | null): CallHealthSession | null {
    const s = this.get(callSid);
    if (!s) return null;
    s.healthScore = this.score(s);
    s.riskLevel   = riskLevel(s.healthScore);
    return { ...s };
  }

  /** Snapshot of all sessions including recently-ended (for history) */
  getAllSessions(): LiveCallSummary[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).map((s) => {
      const hs = this.score(s);
      return {
        callSid: s.callSid,
        storeId: s.storeId,
        callLogId: s.callLogId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        outcome: s.outcome,
        lastAiAudioAt: s.lastAiAudioAt,
        lastUserInputAt: s.lastUserInputAt,
        lastActivityAt: s.lastActivityAt,
        responseStartedAt: s.responseStartedAt,
        lastResponseLatencyMs: s.lastResponseLatencyMs,
        recentResponseLatencies: s.recentResponseLatencies,
        currentTool: s.currentTool,
        toolStartedAt: s.toolStartedAt,
        toolSuccesses: s.toolSuccesses,
        toolFailures: s.toolFailures,
        recentToolLatencies: s.recentToolLatencies,
        silenceEvents: s.silenceEvents,
        fillerInjections: s.fillerInjections,
        autoHealEvents: s.autoHealEvents,
        lastHealAt: s.lastHealAt,
        wsOpen: s.wsOpen,
        healthScore: hs,
        riskLevel: riskLevel(hs),
        recentEvents: s.events.slice(-10),
        recentFailures: s.failures.slice(-5),
        durationSeconds: Math.floor(((s.endedAt ?? now) - s.startedAt) / 1000),
      } satisfies LiveCallSummary;
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private get(callSid: string | null): CallHealthSession | undefined {
    if (!callSid) return undefined;
    // Try direct lookup first
    const direct = this.sessions.get(callSid);
    if (direct) return direct;
    // Fall back to scanning (e.g., anon sessions)
    for (const [, s] of this.sessions) {
      if (s.callSid === callSid && !s.endedAt) return s;
    }
    return undefined;
  }

  private log(s: CallHealthSession, type: HealthEvent["type"], detail: string, layer?: string): void {
    const event: HealthEvent = { at: Date.now(), type, detail, layer };
    s.events = [...s.events.slice(-(MAX_EVENTS - 1)), event];
    s.lastActivityAt = event.at;
  }

  private score(s: CallHealthSession): number {
    const now    = Date.now();
    const window = now - SCORE_WINDOW_MS;
    let pts = 100;

    // WebSocket closed → heavy penalty
    if (!s.wsOpen && !s.endedAt) pts -= 40;

    // Recent silence events (last 90s)
    const recentSilence = s.events.filter((e) => e.type === "silence" && e.at > window);
    pts -= Math.min(recentSilence.length * 6, 30);

    // Recent tool failures
    const recentToolFails = s.events.filter((e) => e.type === "tool_fail" && e.at > window);
    pts -= Math.min(recentToolFails.length * 8, 24);

    // Last response latency
    if (s.lastResponseLatencyMs) {
      if      (s.lastResponseLatencyMs > 4_000) pts -= 20;
      else if (s.lastResponseLatencyMs > 2_500) pts -= 10;
      else if (s.lastResponseLatencyMs > 1_500) pts -= 3;
    }

    // AI audio gap during active call (not in first 10s of call)
    const callAge = now - s.startedAt;
    if (s.wsOpen && callAge > 10_000) {
      const audioGap = now - s.lastAiAudioAt;
      if      (audioGap > 8_000) pts -= 25;
      else if (audioGap > 4_000) pts -= 12;
      else if (audioGap > 2_500) pts -= 5;
    }

    // Recent filler injections > 3 (sign of repeated stalls)
    const recentFillers = s.events.filter((e) => e.type === "filler" && e.at > window);
    if (recentFillers.length > 3) pts -= 10;

    // Tool currently running for > 2s
    if (s.toolStartedAt && now - s.toolStartedAt > 2_000) pts -= 8;

    return Math.max(0, Math.min(100, Math.round(pts)));
  }

  private maybeAutoHeal(s: CallHealthSession, trigger: string): void {
    const score = this.score(s);
    if (score >= 30) return;
    const now = Date.now();
    if (s.lastHealAt && now - s.lastHealAt < HEAL_COOLDOWN_MS) return;

    s.autoHealEvents++;
    s.lastHealAt = now;
    this.log(s, "heal", `Auto-heal triggered at score=${score} by ${trigger}`);

    // Mark the most recent unhealed failure as auto-healed
    const unhealed = s.failures.filter((f) => !f.autoHealed);
    if (unhealed.length) unhealed[unhealed.length - 1].autoHealed = true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskLevel(score: number): "stable" | "degraded" | "high_risk" | "critical" {
  if (score >= 70) return "stable";
  if (score >= 50) return "degraded";
  if (score >= 30) return "high_risk";
  return "critical";
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const callHealthTracker = new CallHealthTracker();
