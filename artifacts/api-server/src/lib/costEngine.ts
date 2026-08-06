/**
 * Cost Estimation Engine
 *
 * Calculates Twilio + OpenAI Realtime costs per call.
 * All rates are configurable via environment variables.
 *
 * Default rates (as of 2024 pricing):
 *   Twilio inbound voice:   $0.0085/min
 *   Twilio media streaming: $0.01/min  → total ~$0.022/min (env: TWILIO_COST_PER_MIN)
 *   OpenAI audio input:     $100 / 1M tokens (env: OPENAI_AUDIO_IN_COST_PER_1M)
 *   OpenAI audio output:    $200 / 1M tokens (env: OPENAI_AUDIO_OUT_COST_PER_1M)
 *   OpenAI text input:      $5   / 1M tokens (env: OPENAI_TEXT_IN_COST_PER_1M)
 *   OpenAI text output:     $20  / 1M tokens (env: OPENAI_TEXT_OUT_COST_PER_1M)
 */

const TWILIO_PER_MIN            = parseFloat(process.env.TWILIO_COST_PER_MIN            || "0.022");
const OPENAI_AUDIO_IN_PER_1M    = parseFloat(process.env.OPENAI_AUDIO_IN_COST_PER_1M    || "100");
const OPENAI_AUDIO_OUT_PER_1M   = parseFloat(process.env.OPENAI_AUDIO_OUT_COST_PER_1M   || "200");
const OPENAI_TEXT_IN_PER_1M     = parseFloat(process.env.OPENAI_TEXT_IN_COST_PER_1M     || "5");
const OPENAI_TEXT_OUT_PER_1M    = parseFloat(process.env.OPENAI_TEXT_OUT_COST_PER_1M    || "20");

export interface TokenUsage {
  audioTokensIn:  number;
  audioTokensOut: number;
  textTokensIn:   number;
  textTokensOut:  number;
}

export interface CallCost {
  twilioMinutes:   number;
  twilioEstCost:   number;
  openaiEstCost:   number;
  totalEstCost:    number;
  breakdown: {
    audioIn:  number;
    audioOut: number;
    textIn:   number;
    textOut:  number;
  };
}

export function estimateCallCost(durationSeconds: number, tokens: TokenUsage): CallCost {
  const twilioMinutes = durationSeconds / 60;
  const twilioEstCost = twilioMinutes * TWILIO_PER_MIN;

  const audioIn  = (tokens.audioTokensIn  / 1_000_000) * OPENAI_AUDIO_IN_PER_1M;
  const audioOut = (tokens.audioTokensOut / 1_000_000) * OPENAI_AUDIO_OUT_PER_1M;
  const textIn   = (tokens.textTokensIn   / 1_000_000) * OPENAI_TEXT_IN_PER_1M;
  const textOut  = (tokens.textTokensOut  / 1_000_000) * OPENAI_TEXT_OUT_PER_1M;
  const openaiEstCost = audioIn + audioOut + textIn + textOut;

  return {
    twilioMinutes:  round4(twilioMinutes),
    twilioEstCost:  round4(twilioEstCost),
    openaiEstCost:  round4(openaiEstCost),
    totalEstCost:   round4(twilioEstCost + openaiEstCost),
    breakdown: {
      audioIn:  round4(audioIn),
      audioOut: round4(audioOut),
      textIn:   round4(textIn),
      textOut:  round4(textOut),
    },
  };
}

export function getCostRates() {
  return {
    twilioPerMin:         TWILIO_PER_MIN,
    openaiAudioInPer1M:   OPENAI_AUDIO_IN_PER_1M,
    openaiAudioOutPer1M:  OPENAI_AUDIO_OUT_PER_1M,
    openaiTextInPer1M:    OPENAI_TEXT_IN_PER_1M,
    openaiTextOutPer1M:   OPENAI_TEXT_OUT_PER_1M,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
