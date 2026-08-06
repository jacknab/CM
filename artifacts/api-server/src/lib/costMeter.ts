/**
 * Cost Meter — per-call in-memory usage tracker with DB flush on call end.
 *
 * Tracks:
 *   - OpenAI token usage (from response.done events)
 *   - Tool call count
 *   - AI response count
 *   - Call duration
 *   - Estimated Twilio + OpenAI costs
 *
 * On call end, flushes a record to `call_usage_records`.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { callUsageRecords, locations } from "@shared/schema";
import { type TokenUsage, type CallCost } from "./costEngine";
import { callEventBus } from "./callEventBus";
import { OPENAI_PRICING } from "./openaiPricing";

/**
 * Per-second credit charge deducted from the salon's platform balance.
 * $0.0041/second = $0.25/minute.
 * Override with AI_CALL_RATE_PER_SECOND in your .env (e.g. AI_CALL_RATE_PER_SECOND=0.0041).
 */
const AI_CALL_RATE_PER_SECOND = parseFloat(process.env.AI_CALL_RATE_PER_SECOND || "0.0041");

type UsageTotals = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  audioTokens: number;
  cachedTokens: number;
  cachedTextTokens: number;
  cachedAudioTokens: number;
};

export interface ActiveSession {
  callSid:        string;
  storeId:        number;
  callLogId:      number | null;
  startedAt:      Date;
  lastActivityAt: Date;
  tokens:         TokenUsage;
  usageTotals:    UsageTotals;
  openaiCostAccumulated: number;
  lastUsageRaw: Record<string, unknown> | null;
  toolCallCount:  number;
  aiResponseCount: number;
  terminationReason: string | null;
}

class CostMeterService {
  private readonly sessions = new Map<string, ActiveSession>();

  startSession(callSid: string, storeId: number, callLogId: number | null = null): void {
    const session: ActiveSession = {
      callSid,
      storeId,
      callLogId,
      startedAt:       new Date(),
      lastActivityAt:  new Date(),
      tokens: { audioTokensIn: 0, audioTokensOut: 0, textTokensIn: 0, textTokensOut: 0 },
      usageTotals: {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        audioTokens: 0,
        cachedTokens: 0,
        cachedTextTokens: 0,
        cachedAudioTokens: 0,
      },
      openaiCostAccumulated: 0,
      lastUsageRaw: null,
      toolCallCount:   0,
      aiResponseCount: 0,
      terminationReason: null,
    };
    this.sessions.set(callSid, session);
    console.log(`[CostMeter] Session started — callSid=${callSid} store=${storeId}`);
  }

  /** Called on every OpenAI `response.done` event with the usage field. */
  recordTokens(callSid: string, usage: Record<string, unknown>): void {
    const s = this.sessions.get(callSid);
    if (!s) return;

    const inputDetails = (usage.input_token_details as Record<string, unknown> | undefined) ?? {};
    const outputDetails = (usage.output_token_details as Record<string, unknown> | undefined) ?? {};
    const cachedDetails = (inputDetails.cached_tokens_details as Record<string, unknown> | undefined) ?? {};

    const inputAudioTokens = Number(inputDetails.audio_tokens ?? 0) || 0;
    const outputAudioTokens = Number(outputDetails.audio_tokens ?? 0) || 0;
    const inputTextTokens = Number(inputDetails.text_tokens ?? 0) || 0;
    const outputTextTokens = Number(outputDetails.text_tokens ?? 0) || 0;
    const cachedTextTokens = Number(cachedDetails.text_tokens ?? 0) || 0;
    const cachedAudioTokens = Number(cachedDetails.audio_tokens ?? 0) || 0;
    const totalTokens = Number(usage.total_tokens ?? 0) || 0;
    const inputTokens = Number(usage.input_tokens ?? 0) || 0;
    const outputTokens = Number(usage.output_tokens ?? 0) || 0;
    const cachedTokens = Number(inputDetails.cached_tokens ?? 0) || 0;

    // SINGLE SOURCE OF TRUTH: response.done.usage only.
    s.tokens.audioTokensIn += inputAudioTokens;
    s.tokens.audioTokensOut += outputAudioTokens;
    s.tokens.textTokensIn += inputTextTokens;
    s.tokens.textTokensOut += outputTextTokens;

    s.usageTotals.totalTokens += totalTokens;
    s.usageTotals.inputTokens += inputTokens;
    s.usageTotals.outputTokens += outputTokens;
    s.usageTotals.audioTokens += inputAudioTokens + outputAudioTokens;
    s.usageTotals.cachedTokens += cachedTokens;
    s.usageTotals.cachedTextTokens += cachedTextTokens;
    s.usageTotals.cachedAudioTokens += cachedAudioTokens;

    const responseCost = this.calculateOpenAICostFromUsage({
      inputAudioTokens,
      outputAudioTokens,
      inputTextTokens,
      outputTextTokens,
      cachedTextTokens,
      cachedAudioTokens,
    });
    s.openaiCostAccumulated += responseCost;
    s.lastUsageRaw = usage;

    s.aiResponseCount++;
    s.lastActivityAt = new Date();

    // Emit live cost update to dashboard subscribers
    const elapsedSeconds = (Date.now() - s.startedAt.getTime()) / 1000;
    const twilioMinutes = elapsedSeconds / 60;
    const twilioEstCost = twilioMinutes * OPENAI_PRICING.twilioPerMin;
    const totalEstCost = twilioEstCost + s.openaiCostAccumulated;
    callEventBus.emit({
      type: "ai_response",
      storeId: s.storeId,
      timestamp: new Date().toISOString(),
      data: {
        liveCostUsd: round4(totalEstCost),
        openaiCostUsd: round4(s.openaiCostAccumulated),
        aiResponseCount: s.aiResponseCount,
        tokens: s.tokens,
      },
    });
  }

  recordToolCall(callSid: string): void {
    const s = this.sessions.get(callSid);
    if (!s) return;
    console.warn("[CostMeter] Invalid cost mutation attempt blocked");
    s.toolCallCount++;
    s.lastActivityAt = new Date();
  }

  recordAudioActivity(callSid: string): void {
    const s = this.sessions.get(callSid);
    if (!s) return;
    console.warn("[CostMeter] Invalid cost mutation attempt blocked");
    s.lastActivityAt = new Date();
  }

  getSession(callSid: string): ActiveSession | undefined {
    return this.sessions.get(callSid);
  }

  getLiveSnapshot(callSid: string): { elapsedSeconds: number; estimatedCostUsd: number; cost: CallCost } | null {
    const s = this.sessions.get(callSid);
    if (!s) return null;
    const elapsedSeconds = (Date.now() - s.startedAt.getTime()) / 1000;
    const twilioMinutes = elapsedSeconds / 60;
    const twilioEstCost = twilioMinutes * OPENAI_PRICING.twilioPerMin;
    const openaiEstCost = s.openaiCostAccumulated;
    const totalEstCost = twilioEstCost + openaiEstCost;
    const cost: CallCost = {
      twilioMinutes: round4(twilioMinutes),
      twilioEstCost: round4(twilioEstCost),
      openaiEstCost: round4(openaiEstCost),
      totalEstCost: round4(totalEstCost),
      breakdown: {
        audioIn: 0,
        audioOut: 0,
        textIn: 0,
        textOut: 0,
      },
    };
    return { elapsedSeconds, estimatedCostUsd: cost.totalEstCost, cost };
  }

  getActiveSessionsForStore(storeId: number): ActiveSession[] {
    return [...this.sessions.values()].filter((s) => s.storeId === storeId);
  }

  /** Flush session to DB. Safe to call multiple times (idempotent after first flush). */
  async endSession(callSid: string, terminationReason = "normal"): Promise<void> {
    const s = this.sessions.get(callSid);
    if (!s) return;
    this.sessions.delete(callSid);

    const durationSeconds = Math.round((Date.now() - s.startedAt.getTime()) / 1000);

    // Calls ≤30 seconds are not charged — zero out all costs
    const isShortCall = durationSeconds <= 30;
    if (isShortCall && terminationReason !== "short_call") terminationReason = "short_call";

    const twilioMinutes = isShortCall ? 0 : durationSeconds / 60;
    const twilioEstCost = isShortCall ? 0 : twilioMinutes * OPENAI_PRICING.twilioPerMin;
    const openaiEstCost = isShortCall ? 0 : s.openaiCostAccumulated;
    const totalEstCost  = isShortCall ? 0 : twilioEstCost + openaiEstCost;

    try {
      await db.insert(callUsageRecords).values({
        callLogId:        s.callLogId,
        storeId:          s.storeId,
        callSid:          callSid,
        durationSeconds,
        audioTokensIn:    s.tokens.audioTokensIn,
        audioTokensOut:   s.tokens.audioTokensOut,
        textTokensIn:     s.tokens.textTokensIn,
        textTokensOut:    s.tokens.textTokensOut,
        inputTokens:      s.usageTotals.inputTokens,
        outputTokens:     s.usageTotals.outputTokens,
        totalTokens:      s.usageTotals.totalTokens,
        cachedTokens:     s.usageTotals.cachedTokens,
        rawUsage:         (s.lastUsageRaw ?? {}) as Record<string, unknown>,
        toolCallCount:    s.toolCallCount,
        aiResponseCount:  s.aiResponseCount,
        twilioMinutes:    round4(twilioMinutes).toString(),
        twilioEstCost:    round4(twilioEstCost).toString(),
        openaiEstCost:    round4(openaiEstCost).toString(),
        totalEstCost:     round4(totalEstCost).toString(),
        terminationReason,
      });
      console.log(
        `[CostMeter] Session flushed — callSid=${callSid} store=${s.storeId} ` +
        `duration=${durationSeconds}s cost=$${round4(totalEstCost).toFixed(4)} reason=${terminationReason}`
      );

      console.log(
        `[CostMeter][DEBUG] tokens_total=${s.usageTotals.totalTokens} ` +
        `input_tokens=${s.usageTotals.inputTokens} output_tokens=${s.usageTotals.outputTokens} ` +
        `audio_tokens=${s.usageTotals.audioTokens} cached_tokens=${s.usageTotals.cachedTokens} ` +
        `cached_text_tokens=${s.usageTotals.cachedTextTokens} cached_audio_tokens=${s.usageTotals.cachedAudioTokens} ` +
        `openai_cost=$${round4(openaiEstCost).toFixed(4)} twilio_cost=$${round4(twilioEstCost).toFixed(4)} ` +
        `final_cost=$${round4(totalEstCost).toFixed(4)} raw_usage=${JSON.stringify(s.lastUsageRaw ?? {})}`
      );

      // ── Deduct per-second credit from salon's platform balance ─────────────
      // $0.0041/second = $0.25/minute. Skip zero-duration calls only.
      if (durationSeconds > 0 && AI_CALL_RATE_PER_SECOND > 0) {
        try {
          const charge = round4(durationSeconds * AI_CALL_RATE_PER_SECOND);
          const mins   = Math.floor(durationSeconds / 60);
          const secs   = durationSeconds % 60;
          const label  = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

          // Allow balance to go negative — we never cut off a live call mid-way.
          // New calls are blocked at the webhook once balance reaches -$10.00.
          const updated = await db
            .update(locations)
            .set({ platformCredits: sql`COALESCE(platform_credits, 0) - ${charge.toString()}` })
            .where(eq(locations.id, s.storeId))
            .returning({ balance: locations.platformCredits });

          const newBalance = parseFloat(updated[0]?.balance ?? "0");

          const { logCreditTransaction } = await import("./creditLedger");
          await logCreditTransaction({
            storeId:      s.storeId,
            type:         "ai_call",
            amount:       -charge,
            description:  `AI Receptionist call (${label})`,
            balanceAfter: newBalance,
            referenceId:  callSid,
          });

          console.log(
            `[CostMeter] Credit deducted — store=${s.storeId} charge=$${charge} ` +
            `balance_after=$${newBalance.toFixed(2)} callSid=${callSid}`
          );

          // Fire real-time low-balance alert if threshold crossed (non-blocking)
          import("../services/low-balance-scheduler").then(({ maybeSendLowBalanceAlert }) => {
            maybeSendLowBalanceAlert(s.storeId, newBalance).catch(() => {});
          }).catch(() => {});

          // Auto-refill: if balance dropped below threshold, charge saved card (non-blocking)
          import("./autoRefill").then(({ maybeAutoRefill }) => {
            maybeAutoRefill(s.storeId, newBalance).catch(() => {});
          }).catch(() => {});
        } catch (err: any) {
          console.error("[CostMeter] Failed to deduct call credit:", err.message);
        }
      }
    } catch (err: any) {
      console.error("[CostMeter] Failed to flush session to DB:", err.message);
    }

    callEventBus.emit({
      type: "call_end",
      storeId: s.storeId,
      timestamp: new Date().toISOString(),
      data: {
        callSid,
        durationSeconds,
        cost: round4(totalEstCost),
        terminationReason,
        toolCallCount:  s.toolCallCount,
        aiResponseCount: s.aiResponseCount,
      },
    });
  }

  private calculateOpenAICostFromUsage(input: {
    inputAudioTokens: number;
    outputAudioTokens: number;
    inputTextTokens: number;
    outputTextTokens: number;
    cachedTextTokens: number;
    cachedAudioTokens: number;
  }): number {
    const billableTextIn = Math.max(0, input.inputTextTokens - input.cachedTextTokens);
    const billableAudioIn = Math.max(0, input.inputAudioTokens - input.cachedAudioTokens);

    const audioIn = (billableAudioIn / 1_000_000) * OPENAI_PRICING.audioInPer1M;
    const audioOut = (input.outputAudioTokens / 1_000_000) * OPENAI_PRICING.audioOutPer1M;
    const textIn = (billableTextIn / 1_000_000) * OPENAI_PRICING.textInPer1M;
    const textOut = (input.outputTextTokens / 1_000_000) * OPENAI_PRICING.textOutPer1M;
    const cachedTextIn = (input.cachedTextTokens / 1_000_000) * OPENAI_PRICING.cachedTextInPer1M;
    const cachedAudioIn = (input.cachedAudioTokens / 1_000_000) * OPENAI_PRICING.cachedAudioInPer1M;

    return round4(audioIn + audioOut + textIn + textOut + cachedTextIn + cachedAudioIn);
  }
}

export const costMeter = new CostMeterService();

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
