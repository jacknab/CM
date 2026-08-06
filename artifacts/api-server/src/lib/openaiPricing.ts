export const OPENAI_PRICING = {
  audioInPer1M: parseFloat(process.env.OPENAI_AUDIO_IN_COST_PER_1M || "32"),
  audioOutPer1M: parseFloat(process.env.OPENAI_AUDIO_OUT_COST_PER_1M || "64"),
  textInPer1M: parseFloat(process.env.OPENAI_TEXT_IN_COST_PER_1M || "4"),
  textOutPer1M: parseFloat(process.env.OPENAI_TEXT_OUT_COST_PER_1M || "16"),
  cachedAudioInPer1M: parseFloat(process.env.OPENAI_CACHED_AUDIO_IN_COST_PER_1M || "0.4"),
  cachedTextInPer1M: parseFloat(process.env.OPENAI_CACHED_TEXT_IN_COST_PER_1M || "0.4"),
  twilioPerMin: parseFloat(process.env.TWILIO_COST_PER_MIN || "0.022"),
} as const;

