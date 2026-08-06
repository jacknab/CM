import { getRedisClient } from "../../lib/redis";

export type CallRiskInput = {
  phone?: string | null;
  transcript?: string | null;
  silenceDurationMs?: number;
  responseLatencyMs?: number;
  dtmfDetected?: boolean;
  repeatedPhraseCount?: number;
  callDurationSec?: number;
};

export type CallRiskDecision = {
  score: number;
  reasons: string[];
  classification: "clean" | "suspicious" | "spam";
  action: "allow_ai" | "limited_interaction" | "terminate_call";
  skipOpenAi: boolean;
};

const TELEMARKETING_PATTERNS = [
  /business\s+owner/i,
  /quick\s+call/i,
  /marketing/i,
  /we\s+help\s+businesses/i,
];

export function scoreCallRisk(input: CallRiskInput): CallRiskDecision {
  let score = 0;
  const reasons: string[] = [];

  const transcript = (input.transcript ?? "").trim();
  const lower = transcript.toLowerCase();

  // Silence / dead-air
  if ((input.silenceDurationMs ?? 0) >= 2500) {
    score += 30;
    reasons.push("silence_first_turn");
  }

  // Robot-like immediate speech after connect
  if ((input.responseLatencyMs ?? Number.MAX_SAFE_INTEGER) < 500) {
    score += 25;
    reasons.push("instant_speech_pattern");
  }

  // Scripted telemarketing opener patterns
  if (lower && TELEMARKETING_PATTERNS.some((p) => p.test(lower))) {
    score += 40;
    reasons.push("telemarketing_phrase_match");
  }

  // Loop / repetition
  if ((input.repeatedPhraseCount ?? 0) >= 1) {
    score += 35;
    reasons.push("repetition_loop");
  }

  // DTMF (optional signal)
  if (input.dtmfDetected) {
    score += 50;
    reasons.push("early_dtmf");
  }

  // Very short call behavior
  if ((input.callDurationSec ?? Number.MAX_SAFE_INTEGER) < 3) {
    score += 25;
    reasons.push("very_short_call_pattern");
  }

  let classification: CallRiskDecision["classification"] = "clean";
  let action: CallRiskDecision["action"] = "allow_ai";

  if (score >= 60) {
    classification = "spam";
    action = "terminate_call";
  } else if (score >= 30) {
    classification = "suspicious";
    action = "limited_interaction";
  }

  // Cost-protection hard rule
  const skipOpenAi = score >= 40;

  return { score, reasons, classification, action, skipOpenAi };
}

export async function recordBlockedNumber(phone: string, score: number, reasons: string[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const normalized = String(phone || "").trim();
  if (!normalized) return;

  const key = `blocked_numbers:${normalized}`;
  const now = new Date().toISOString();

  try {
    const prevCountRaw = await redis.hget(key, "count");
    const count = Number(prevCountRaw ?? "0") + 1;
    await redis.hset(
      key,
      "phone", normalized,
      "score", String(score),
      "reason", reasons.join(",") || "spam_filter",
      "timestamp", now,
      "count", String(count),
    );
    // Keep for 30 days; repeated offenders refresh TTL.
    await redis.expire(key, 30 * 24 * 60 * 60);
  } catch {
    // Non-fatal; never break call path for telemetry writes.
  }
}

