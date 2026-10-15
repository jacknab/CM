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
/** The caller said something and Autumn has not started answering for this long → one short holding line. */
const HOLD_AFTER_MS             = 3_500;
/** Autumn finished speaking (on the phone, not just generated) and the caller made no sound for this long → ask again. */
const REPROMPT_AFTER_MS         = 5_000;
/** At most this many re-asks in a row without the caller saying anything. */
const MAX_REPROMPTS             = 2;
/** Autumn's last words were a goodbye: silence after that is the call ending, not a question going unanswered. */
const GOODBYE_RE = /\b(good ?bye|bye|have a (great|good|nice|wonderful) (day|night|evening|one)|take care|see you (soon|then|tomorrow))\b[^?]*$/i;

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

  // ── Conversation flow (no dead air) ─────────────────────────────────────────
  /** Last time a frame of Autumn's voice actually went out to the phone. */
  private lastAiPlaybackAt  = 0;
  /** Last time the caller made a sound on the line (several voiced frames in a row). */
  private lastCallerSoundAt = 0;
  /** Last time the caller's words were heard (transcript). */
  private lastCallerWordsAt = 0;
  private holdingLineSent   = false;
  private holdingSentAt     = 0;
  /** Separate stretches of Autumn's speech since the holding line (the holding line itself, then the answer). */
  private burstsSinceHold   = 0;
  private repromptCount     = 0;
  private lastAutumnText    = "";

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
    const now = Date.now();
    if (this.holdingSentAt && now - this.lastAiAudioAt > 1_500) this.burstsSinceHold++;
    this.lastAiAudioAt = now;
    // Output audio arrived — whatever we were waiting on has resolved.
    this.toolResultDeliveredAt = 0;
  }

  onToolStart(): void {
    this.toolInProgress = true;
  }

  /** A frame of Autumn's voice was just sent to the phone. */
  onAiPlayback(): void {
    this.lastAiPlaybackAt = Date.now();
  }

  /** The caller made a sound on the line. Any sound means they are there, so no re-ask. */
  onCallerSound(): void {
    this.lastCallerSoundAt = Date.now();
  }

  /** The caller's words came through: a new turn of theirs. */
  onCallerWords(): void {
    this.lastCallerWordsAt = Date.now();
    this.lastCallerSoundAt = this.lastCallerWordsAt;
    this.holdingLineSent = false;
    this.holdingSentAt = 0;
    this.burstsSinceHold = 0;
    this.repromptCount = 0;
  }

  /** What Autumn has just been saying (her live transcript), to recognise a goodbye. */
  onAutumnText(text: string): void {
    this.lastAutumnText = text.slice(-200);
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
    this.checkConversationFlow(now);

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

  /**
   * The two kinds of dead air a caller notices on a recording:
   *  - they spoke and Autumn says nothing while she works it out → one short holding line, so they know she's there;
   *  - Autumn asked something and the caller says nothing → after a few seconds she checks in and asks again in
   *    other words, like a person on the phone would (at most twice, and never after a goodbye).
   */
  private checkConversationFlow(now: number): void {
    if (!this.sendFn || now - this.lastNudgeAt < NUDGE_DEBOUNCE_MS) return;

    // 1. The caller's turn is over and nothing has come back yet.
    const callerTurnAt = Math.max(this.lastCallerWordsAt, this.lastCallerSoundAt);
    if (
      !this.holdingLineSent &&
      this.lastCallerWordsAt > this.lastAiPlaybackAt &&
      this.lastAiAudioAt < this.lastCallerWordsAt &&
      now - callerTurnAt > HOLD_AFTER_MS
    ) {
      this.holdingLineSent = true;
      this.holdingSentAt = now;
      this.burstsSinceHold = 0;
      this.nudge(now, "CALLER_WAITING", now - callerTurnAt,
        "SYSTEM: The caller finished speaking a few seconds ago and has heard nothing back, so they may think the call dropped. " +
        "Say one short, natural holding line right now, like \"Okay, one moment\" or \"Sure, give me just a second\", " +
        "then continue as soon as you have the answer. Say it only once, and do not repeat what the caller said.");
      return;
    }

    // 2. Autumn's turn is over and the caller has said nothing.
    const autumnDone = this.lastAiPlaybackAt > 0 && this.lastAiAudioAt <= this.lastAiPlaybackAt;
    // After a holding line she still owes the answer: no "are you still there?" until she has given it.
    const answerGiven = !this.holdingSentAt || this.burstsSinceHold >= 2 || now - this.holdingSentAt > 25_000;
    if (
      autumnDone &&
      answerGiven &&
      !this.toolInProgress &&
      this.toolResultDeliveredAt === 0 &&
      this.repromptCount < MAX_REPROMPTS &&
      this.lastCallerSoundAt < this.lastAiPlaybackAt &&
      this.lastCallerWordsAt < this.lastAiPlaybackAt &&
      now - this.lastAiPlaybackAt > REPROMPT_AFTER_MS &&
      !GOODBYE_RE.test(this.lastAutumnText.trim())
    ) {
      this.repromptCount++;
      const first = this.repromptCount === 1;
      this.nudge(now, first ? "CALLER_SILENT" : "CALLER_SILENT_AGAIN", now - this.lastAiPlaybackAt, first
        ? "SYSTEM: You finished speaking about five seconds ago and the caller has said nothing. Check in the way a person " +
          "on the phone would and ask your last question again in different words, briefly — for example \"Sorry, are you " +
          "still there? I was asking what day works best for you.\" If you had not asked anything, ask how you can help."
        : "SYSTEM: The caller is still quiet. Say warmly that you're still here whenever they're ready, and repeat the " +
          "question once more in a few words. Keep it short.");
    }
  }

  private nudge(now: number, layer: string, silenceMs: number, content: string): void {
    this.logSilenceEvent(layer, silenceMs, "instructions_append_nudge");
    this.sendFn?.({ type: "session.instructions.append", delegation_id: null, content });
    this.lastNudgeAt = now;
    if (this.storeId) {
      callEventBus.emit({
        type: "filler_injected", storeId: this.storeId, callSid: this.callSid ?? undefined,
        timestamp: new Date().toISOString(), data: { layer, silenceDurationMs: silenceMs },
      });
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
