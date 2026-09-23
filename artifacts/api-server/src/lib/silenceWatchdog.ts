/**
 * SilenceWatchdog — per-call reliability metrics + one dead-air guard.
 *
 * Under the OpenAI Live API, turn-taking is fully autonomous — GPT-Live decides
 * when to speak, and this app never sends response.create/response.cancel to
 * drive the voice channel. That made most of this watchdog's original job
 * obsolete: the old L1/L2/L4/L5 layers forced response.create or response.cancel
 * on fixed timers to guard against a turn-control model this app no longer owns.
 * Under Live, response.create means something different (continue the backend
 * delegation) and firing it at those old trigger points would misfire against
 * the wrong thing rather than simply no-op.
 *
 * What remains:
 *   - Passive call-quality metrics (tool success/failure, fail-safe mode)
 *   - Silence-event logging to DB for analytics (L9)
 *   - One new guard: if no output audio arrives within a few seconds of
 *     delivering a tool result, nudge the voice model via
 *     session.instructions.append (the still-valid Live mechanism for
 *     corrective/contextual guidance), rather than trying to reconstruct the
 *     old response.create-based recovery machinery blind.
 *
 * Usage:
 *   const watchdog = new SilenceWatchdog();
 *   watchdog.start({ callSid, storeId, callLogId, send });
 *   // wire up: onSessionReady / onAiAudioDelta / onToolStart / onToolEnd /
 *   //          onToolResultDelivered / onFailure
 *   watchdog.stop();
 *   await watchdog.flushToDB();
 */

import { db } from "../db";
import { aiSilenceIncidents } from "@shared/schema";
import { callEventBus } from "./callEventBus";

// ─── Thresholds ────────────────────────────────────────────────────────────────

const TICK_MS                   = 500;
const POST_TOOL_SILENCE_MS      = 4_000;  // no output audio this long after a tool result → nudge
const NUDGE_DEBOUNCE_MS         = 5_000;  // minimum gap between consecutive nudges
const FAIL_SAFE_THRESHOLD       = 2;      // failures needed to enter fail-safe mode

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SilenceEvent {
  timestamp:        string;
  callSid:          string | null;
  storeId:          number;
  layer:            string;
  silenceDurationMs: number;
  recoveryAction:   string;
}

// ─── SilenceWatchdog ──────────────────────────────────────────────────────────

export class SilenceWatchdog {
  // ── Timestamps ──────────────────────────────────────────────────────────────
  private lastAiAudioAt          = 0;
  private toolResultDeliveredAt  = 0;   // 0 = not currently waiting on a post-tool response

  // ── State flags ─────────────────────────────────────────────────────────────
  private sessionActive    = false;
  private toolInProgress   = false;
  private destroyed        = false;

  // ── Failure tracking (L8) ────────────────────────────────────────────────────
  private failureCount = 0;

  // ── Nudge debounce ───────────────────────────────────────────────────────────
  private lastNudgeAt = 0;

  // ── Silence event log (L9) ───────────────────────────────────────────────────
  private readonly pendingEvents: SilenceEvent[] = [];

  // ── Call metadata ────────────────────────────────────────────────────────────
  private callSid:    string | null = null;
  private storeId     = 0;
  private callLogId:  number | null = null;

  // ── Callbacks / internals ────────────────────────────────────────────────────
  private sendFn:   ((msg: object) => void) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  // ─── Public: lifecycle ───────────────────────────────────────────────────────

  start(opts: {
    callSid:    string | null;
    storeId:    number;
    callLogId:  number | null;
    send:       (msg: object) => void;
  }): void {
    this.callSid   = opts.callSid;
    this.storeId   = opts.storeId;
    this.callLogId = opts.callLogId;
    this.sendFn    = opts.send;

    this.lastAiAudioAt = Date.now();

    this.interval = setInterval(() => this.tick(), TICK_MS);
    console.log(`[SilenceWatchdog] Started — store=${this.storeId} callSid=${this.callSid ?? "(none)"}`);
  }

  stop(): void {
    this.destroyed = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // ─── Public: state updaters called by aiReceptionist ────────────────────────

  onSessionReady(): void {
    this.sessionActive = true;
    this.lastAiAudioAt = Date.now();
    console.log(`[SilenceWatchdog] Session ready — watchdog active`);
  }

  onAiAudioDelta(): void {
    this.lastAiAudioAt = Date.now();
    // Output audio arrived — whatever we were waiting on has resolved.
    this.toolResultDeliveredAt = 0;
  }

  onToolStart(): void {
    this.toolInProgress = true;
  }

  onToolEnd(success: boolean): void {
    this.toolInProgress = false;
    if (!success) this.failureCount++;
  }

  /** Called right after a function_call_output + response.create is sent to the backend. */
  onToolResultDelivered(): void {
    this.toolResultDeliveredAt = Date.now();
  }

  onFailure(): void {
    this.failureCount++;
  }

  // ─── Public: queries ────────────────────────────────────────────────────────

  isFailSafeMode(): boolean {
    return this.failureCount >= FAIL_SAFE_THRESHOLD;
  }

  updateCallLogId(id: number): void {
    this.callLogId = id;
  }

  getSilenceEvents(): SilenceEvent[] {
    return [...this.pendingEvents];
  }

  // ─── Public: DB flush (call on session end) ──────────────────────────────────

  async flushToDB(): Promise<void> {
    if (!this.pendingEvents.length) return;
    const events = this.pendingEvents.splice(0);
    try {
      await db.insert(aiSilenceIncidents).values(
        events.map(e => ({
          callLogId:         this.callLogId ?? undefined,
          storeId:           e.storeId,
          callSid:           e.callSid ?? undefined,
          layer:             e.layer,
          silenceDurationMs: e.silenceDurationMs,
          recoveryAction:    e.recoveryAction,
          occurredAt:        new Date(e.timestamp),
        }))
      );
      console.log(`[SilenceWatchdog] Flushed ${events.length} silence event(s) to DB`);
    } catch (err) {
      console.error("[SilenceWatchdog] Failed to flush events to DB:", err);
    }
  }

  // ─── Private: tick ───────────────────────────────────────────────────────────

  private tick(): void {
    if (this.destroyed || !this.sessionActive || !this.sendFn) return;

    const now = Date.now();

    // Post-tool-result dead air: a tool result was delivered to the backend but
    // no output audio has arrived since. Nudge once via session.instructions.append
    // rather than trying to force anything on the voice channel directly.
    if (
      this.toolResultDeliveredAt > 0 &&
      !this.toolInProgress &&
      now - this.toolResultDeliveredAt > POST_TOOL_SILENCE_MS &&
      now - this.lastNudgeAt > NUDGE_DEBOUNCE_MS
    ) {
      const silenceMs = now - this.toolResultDeliveredAt;
      this.logSilenceEvent("POST_TOOL_SILENCE", silenceMs, "instructions_append_nudge");
      console.warn(
        `[SilenceWatchdog] POST_TOOL_SILENCE — no output audio ${silenceMs}ms after a tool result → nudging`
      );
      this.sendFn({
        type: "session.instructions.append",
        delegation_id: null,
        content: "SYSTEM: Continue now with the result you just received — briefly share it with the caller.",
      });
      this.lastNudgeAt = now;

      if (this.storeId) {
        callEventBus.emit({
          type:      "filler_injected",
          storeId:   this.storeId,
          callSid:   this.callSid ?? undefined,
          timestamp: new Date().toISOString(),
          data:      { layer: "POST_TOOL_SILENCE", silenceDurationMs: silenceMs },
        });
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private logSilenceEvent(layer: string, silenceDurationMs: number, recoveryAction: string): void {
    const event: SilenceEvent = {
      timestamp:         new Date().toISOString(),
      callSid:           this.callSid,
      storeId:           this.storeId,
      layer,
      silenceDurationMs,
      recoveryAction,
    };
    this.pendingEvents.push(event);
    console.warn(
      `[SilenceWatchdog] SILENCE EVENT — layer=${layer} duration=${silenceDurationMs}ms ` +
      `recovery="${recoveryAction}" store=${this.storeId} callSid=${this.callSid ?? "(none)"}`
    );
  }
}
