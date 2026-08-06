/**
 * SilenceWatchdog — per-call silence prevention engine.
 *
 * Implements all reliability hardening layers:
 *   L1  Global silence watchdog (no AI audio > 2s → filler)
 *   L2  OpenAI response guarantee (commit with no response.created > 2.5s → re-trigger)
 *   L4  WebSocket stall detection (response stalled > 4s → cancel + filler)
 *   L5  State machine safety override (no activity > 10s → clarification)
 *   L6  Audio continuity (filler phrase injection)
 *   L8  Fail-safe mode (2+ failures → simpler conversation path)
 *   L9  Silence logging (stored in DB via flush on call end)
 *
 * Turn Ownership Model:
 *   Each user utterance (identified by input_audio_buffer.committed) owns exactly
 *   ONE primary response. L1/L4 filler injection is suppressed while a tool call
 *   is in progress — the L6 timer in aiReceptionist handles that window.
 *
 * Usage:
 *   const watchdog = new SilenceWatchdog();
 *   watchdog.start({ callSid, storeId, callLogId, send });
 *   // wire up: onTurnStart / onPrimaryResponseEmitted /
 *   //          onSessionReady / onAiAudioDelta / onResponseCreateSent /
 *   //          onResponseCreated / onResponseDone / onUserSpeechCommit /
 *   //          onOpenAiEvent / onToolStart / onToolEnd / onFailure
 *   watchdog.stop();
 *   await watchdog.flushToDB();
 */

import { db } from "../db";
import { aiSilenceIncidents } from "@shared/schema";
import { callEventBus } from "./callEventBus";

// ─── Filler phrases ────────────────────────────────────────────────────────────

const FILLER_PHRASES = [
  "One moment while I check that for you.",
  "Let me just pull that up.",
  "Checking availability now.",
  "Just a moment, I'm looking into that.",
  "Bear with me for just a second.",
  "Almost there, just one moment.",
];

function randomFiller(): string {
  return FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
}

// ─── Thresholds ────────────────────────────────────────────────────────────────

const TICK_MS                  = 500;
const AUDIO_SILENCE_MS         = 2_000;   // L1: no audio delta while response in flight
const RESPONSE_GUARANTEE_MS    = 2_500;   // L2: no response.created after user speech commit
const WS_STALL_MS              = 4_000;   // L4: response created but still no audio
const STATE_CONFUSION_MS       = 10_000;  // L5: zero activity of any kind
const FILLER_DEBOUNCE_MS       = 3_000;   // minimum gap between consecutive filler injections
const FAIL_SAFE_THRESHOLD      = 2;       // L8: failures needed to enter fail-safe mode

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
  private lastResponseCreateAt   = 0;  // when WE last sent response.create
  private lastUserSpeechCommitAt = 0;  // set on commit, cleared after L2 action
  private lastAnyEventAt         = 0;  // any meaningful OpenAI event

  // ── State flags ─────────────────────────────────────────────────────────────
  private sessionActive    = false;
  private responseInFlight = false;
  private toolInProgress   = false;
  private destroyed        = false;

  // ── Failure tracking (L8) ────────────────────────────────────────────────────
  private failureCount = 0;

  // ── Filler debounce ──────────────────────────────────────────────────────────
  private lastFillerAt = 0;

  // ── Silence event log (L9) ───────────────────────────────────────────────────
  private readonly pendingEvents: SilenceEvent[] = [];

  // ── Call metadata ────────────────────────────────────────────────────────────
  private callSid:    string | null = null;
  private storeId     = 0;
  private callLogId:  number | null = null;

  // ── Callbacks / internals ────────────────────────────────────────────────────
  private sendFn:   ((msg: object) => void) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  // ── Per-turn ownership tracking ───────────────────────────────────────────────
  // Each user utterance (identified by input_audio_buffer.committed) owns exactly
  // one primary AI response. Tracks whether we've emitted the primary response
  // for the current turn, and suppresses duplicate response.creates.
  private userTurnId               = "turn-0";
  private primaryResponseEmittedAt = 0;       // 0 = not yet emitted this turn
  private primaryResponseSource    = "";
  private suppressedThisTurn       = 0;

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

    const now = Date.now();
    this.lastAiAudioAt   = now;
    this.lastAnyEventAt  = now;
    this.lastResponseCreateAt = now;

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

  // ─── Public: turn ownership ──────────────────────────────────────────────────

  /**
   * Called when a new user utterance begins (input_audio_buffer.committed).
   * Resets per-turn dedup state so the new turn can emit its own primary response.
   */
  onTurnStart(turnId: string): void {
    this.userTurnId               = turnId;
    this.primaryResponseEmittedAt = 0;
    this.primaryResponseSource    = "";
    this.suppressedThisTurn       = 0;

    const now = Date.now();
    this.lastUserSpeechCommitAt = now;
    this.lastAnyEventAt         = now;
    console.log(`[SilenceWatchdog][${turnId}] user_turn_id=${turnId} — new turn started, ownership reset`);
  }

  /**
   * Called whenever a response.create is sent (from any source) for the current turn.
   * Records the source for logging. If a primary was already emitted this turn,
   * logs a suppression warning — the CALLER is responsible for not actually sending
   * the duplicate (the watchdog records and reports, aiReceptionist enforces).
   */
  onPrimaryResponseEmitted(source: string, turnId: string): void {
    if (turnId && turnId !== this.userTurnId) {
      this.suppressedThisTurn++;
      console.warn(
        `[SilenceWatchdog] response_suppressed — stale turn ${turnId} (current=${this.userTurnId}) ` +
        `source=${source} suppressed_total=${this.suppressedThisTurn}`
      );
      return;
    }

    if (this.primaryResponseEmittedAt > 0) {
      // Tool results are the authoritative continuation after a function call.
      // If server_vad already emitted for this turn, allow tool_result to take over
      // ownership so slot/pricing results are not suppressed into silence.
      if (source.startsWith("tool_result") && this.primaryResponseSource === "server_vad") {
        this.primaryResponseEmittedAt = Date.now();
        this.primaryResponseSource = source;
        this.lastResponseCreateAt = this.primaryResponseEmittedAt;
        this.responseInFlight = true;
        console.log(
          `[SilenceWatchdog][${this.userTurnId}] response_owner_handoff from=server_vad to=${source} turn_id=${this.userTurnId}`
        );
        return;
      }

      this.suppressedThisTurn++;
      console.warn(
        `[SilenceWatchdog][${this.userTurnId}] response_suppressed source=${source} ` +
        `(primary already emitted by "${this.primaryResponseSource}" at +${Date.now() - this.primaryResponseEmittedAt}ms) ` +
        `suppressed_total=${this.suppressedThisTurn}`
      );
      return;
    }

    this.primaryResponseEmittedAt = Date.now();
    this.primaryResponseSource    = source;
    this.lastResponseCreateAt     = this.primaryResponseEmittedAt;
    this.responseInFlight         = true;
    console.log(
      `[SilenceWatchdog][${this.userTurnId}] response_emitted source=${source} ` +
      `turn_id=${this.userTurnId}`
    );
  }

  /**
   * Logs a suppressed response without attempting to emit anything.
   * Call this when a response.create was blocked before being sent.
   */
  logSuppressedResponse(source: string, reason: string): void {
    this.suppressedThisTurn++;
    console.warn(
      `[SilenceWatchdog][${this.userTurnId}] response_suppressed source=${source} ` +
      `reason="${reason}" suppressed_total=${this.suppressedThisTurn}`
    );
  }

  // ─── Public: state updaters called by aiReceptionist ────────────────────────

  onSessionReady(): void {
    this.sessionActive = true;
    const now = Date.now();
    this.lastAiAudioAt   = now;
    this.lastAnyEventAt  = now;
    this.lastResponseCreateAt = now;
    console.log(`[SilenceWatchdog] Session ready — watchdog active`);
  }

  onAiAudioDelta(): void {
    const now = Date.now();
    this.lastAiAudioAt  = now;
    this.lastAnyEventAt = now;
  }

  /** Called when we SEND response.create (not when OpenAI confirms it). */
  onResponseCreateSent(): void {
    this.lastResponseCreateAt = Date.now();
    this.responseInFlight = true;
  }

  /** Called when OpenAI sends back response.created. */
  onResponseCreated(): void {
    this.responseInFlight = true;
    this.lastAnyEventAt  = Date.now();
  }

  onResponseDone(): void {
    this.responseInFlight = false;
    // Treat response.done as recent activity so L5 doesn't trigger immediately
    const now = Date.now();
    this.lastAiAudioAt  = now;
    this.lastAnyEventAt = now;
  }

  onUserSpeechCommit(): void {
    const now = Date.now();
    this.lastUserSpeechCommitAt = now;
    this.lastAnyEventAt         = now;
  }

  onOpenAiEvent(): void {
    this.lastAnyEventAt = Date.now();
  }

  onToolStart(): void {
    this.toolInProgress = true;
    this.lastAnyEventAt = Date.now();
    console.log(
      `[SilenceWatchdog][${this.userTurnId}] Tool started — L1/L4 filler injection suspended until tool completes`
    );
  }

  onToolEnd(success: boolean): void {
    this.toolInProgress = false;
    if (!success) this.failureCount++;
    this.lastAnyEventAt = Date.now();
    console.log(
      `[SilenceWatchdog][${this.userTurnId}] Tool ended success=${success} — L1/L4 filler injection re-enabled`
    );
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

    // ── L2: Response guarantee ──────────────────────────────────────────────
    // User speech was committed but no response.created has been seen within 2.5s.
    // Force-send another response.create.
    // TURN OWNERSHIP: Only fires if the primary response has not been emitted yet
    // for this turn (primaryResponseEmittedAt === 0 means no primary yet).
    if (
      this.lastUserSpeechCommitAt > 0 &&
      !this.responseInFlight &&
      this.primaryResponseEmittedAt === 0 &&
      now - this.lastUserSpeechCommitAt > RESPONSE_GUARANTEE_MS
    ) {
      const silenceMs = now - this.lastUserSpeechCommitAt;
      this.logSilenceEvent("L2_RESPONSE_GUARANTEE", silenceMs, "force_response_create");
      console.warn(
        `[SilenceWatchdog][${this.userTurnId}] L2 — No AI response ${silenceMs}ms after user speech commit → force response.create ` +
        `response_emitted=true source=L2_response_guarantee`
      );
      this.sendFn({ type: "response.create" });
      this.lastResponseCreateAt   = now;
      this.responseInFlight       = true;
      this.primaryResponseEmittedAt = now;
      this.primaryResponseSource    = "L2_response_guarantee";
      this.lastUserSpeechCommitAt = 0;
      return;
    }

    // ── L1 / L6: Audio silence while a response is in flight ────────────────
    // response.create was sent >= 2s ago AND no audio delta received >= 2s.
    // Inject a filler to keep the caller engaged.
    //
    // TURN OWNERSHIP: Skip entirely if a tool is in progress — the L6 inline
    // timer in aiReceptionist owns the filler window during tool execution.
    // Firing here would create a SECOND filler response for the same tool call.
    if (
      !this.toolInProgress &&
      this.responseInFlight &&
      now - this.lastAiAudioAt       > AUDIO_SILENCE_MS &&
      now - this.lastResponseCreateAt > AUDIO_SILENCE_MS &&
      now - this.lastFillerAt         > FILLER_DEBOUNCE_MS
    ) {
      const silenceMs = now - this.lastAiAudioAt;
      this.injectFiller("L1_AUDIO_SILENCE", silenceMs);
      return;
    }

    // ── L4: WebSocket stall — response created but no audio for 4s ──────────
    // Cancel the stalled response and inject a filler.
    //
    // TURN OWNERSHIP: Skip if a tool is in progress — same reasoning as L1.
    // During tool execution the response is "in flight" but producing no audio
    // because it is waiting for the tool result, not because the WS is stalled.
    if (
      !this.toolInProgress &&
      this.responseInFlight &&
      now - this.lastResponseCreateAt > WS_STALL_MS &&
      now - this.lastAiAudioAt        > WS_STALL_MS &&
      now - this.lastFillerAt          > FILLER_DEBOUNCE_MS
    ) {
      const silenceMs = now - this.lastAiAudioAt;
      this.logSilenceEvent("L4_WS_STALL", silenceMs, "cancel_and_filler");
      console.warn(
        `[SilenceWatchdog][${this.userTurnId}] L4 — WebSocket stall (${silenceMs}ms) → cancelling response and re-injecting`
      );
      this.sendFn({ type: "response.cancel" });
      this.responseInFlight = false;
      const capturedSend = this.sendFn;
      setTimeout(() => {
        if (!this.destroyed) {
          this.injectFiller("L4_WS_STALL_RECOVERY", silenceMs);
        }
      }, 200);
      return;
    }

    // ── L5: State confusion — no meaningful event for 10s ───────────────────
    // The call is live but the state machine is stuck. Ask the caller what they need.
    if (
      !this.responseInFlight &&
      !this.toolInProgress &&
      now - this.lastAnyEventAt > STATE_CONFUSION_MS &&
      now - this.lastFillerAt   > FILLER_DEBOUNCE_MS
    ) {
      const silenceMs = now - this.lastAnyEventAt;
      this.logSilenceEvent("L5_STATE_CONFUSION", silenceMs, "clarification_injected");
      console.warn(
        `[SilenceWatchdog][${this.userTurnId}] L5 — State confusion (${silenceMs}ms idle) → injecting clarification ` +
        `response_emitted=true source=L5_state_confusion`
      );
      this.sendFn({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: 'SYSTEM: The conversation has gone quiet. Ask the caller: "Just to confirm, are you looking to book an appointment or check availability?"',
            },
          ],
        },
      });
      this.sendFn({ type: "response.create" });
      this.lastResponseCreateAt = now;
      this.responseInFlight     = true;
      this.lastFillerAt         = now;
      this.lastAnyEventAt       = now;

      if (this.storeId) {
        callEventBus.emit({
          type:      "filler_injected",
          storeId:   this.storeId,
          callSid:   this.callSid ?? undefined,
          timestamp: new Date().toISOString(),
          data:      { layer: "L5", reason: "state_confusion", silenceDurationMs: silenceMs },
        });
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private injectFiller(layer: string, silenceDurationMs: number): void {
    if (!this.sendFn) return;
    const now    = Date.now();
    const phrase = randomFiller();

    this.logSilenceEvent(layer, silenceDurationMs, `filler: "${phrase}"`);
    console.warn(
      `[SilenceWatchdog][${this.userTurnId}] ${layer} — response_emitted=true source=${layer} ` +
      `Injecting filler (silence=${silenceDurationMs}ms): "${phrase}"`
    );

    this.sendFn({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `SYSTEM: Say this filler phrase immediately without any pause: "${phrase}"`,
          },
        ],
      },
    });
    this.sendFn({ type: "response.create" });

    this.lastResponseCreateAt = now;
    this.lastFillerAt         = now;
    this.responseInFlight     = true;

    if (this.storeId) {
      callEventBus.emit({
        type:      "filler_injected",
        storeId:   this.storeId,
        callSid:   this.callSid ?? undefined,
        timestamp: new Date().toISOString(),
        data:      { layer, phrase, silenceDurationMs },
      });
    }
  }

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
      `recovery="${recoveryAction}" store=${this.storeId} callSid=${this.callSid ?? "(none)"} ` +
      `turn_id=${this.userTurnId}`
    );
  }
}
