/**
 * Maril's opening line, ready before the call (owner, 2026-11-11: "start speaking much sooner after the call is
 * answered"). GPT-Live takes about two seconds to connect and speak, so the opener is made once with OpenAI's speech
 * API in the same "marin" voice, kept on disk as 8 kHz μ-law, and played the moment Twilio's stream starts; Maril's
 * live reply (routes/salesAgent.ts) is queued behind it and carries on from it.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SHAVEZ_ACCOUNT_SUPPORT_GREETING } from "./salesAgentTransfer";

export type MarilOpenerKind = "direct" | "transferred";
/** What the caller hears first. "Cert-ex-ah" is how the brand is spoken (CERTXA_SPOKEN_ALIAS). */
export const MARIL_OPENER_TEXT: Record<MarilOpenerKind, string> = {
  direct: "Thanks for calling Cert-ex-ah Account Services, this is Maril.",
  transferred: SHAVEZ_ACCOUNT_SUPPORT_GREETING,
};
const VOICE = "marin";
const STYLE = "Warm, relaxed and friendly phone voice, like a helpful account specialist answering a call. Natural, steady pace; not slow.";
const DIR = process.env.VOICE_CACHE_DIR || "/var/lib/certxa/voice-cache";
const FRAME_BYTES = 160; // 20 ms of 8 kHz μ-law

const frames = new Map<MarilOpenerKind, string[]>();

/** 16-bit linear → 8-bit G.711 μ-law. */
function linearToUlaw(sample: number): number {
  const BIAS = 0x84, CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  let s = Math.min(Math.abs(sample), CLIP) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** OpenAI's 24 kHz 16-bit mono PCM → 8 kHz μ-law (each output sample averages three input samples). */
function pcm24kToUlaw8k(pcm: Buffer): Buffer {
  const samples = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(Math.floor(samples / 3));
  for (let i = 0; i < out.length; i++) {
    const a = pcm.readInt16LE(i * 6), b = pcm.readInt16LE(i * 6 + 2), c = pcm.readInt16LE(i * 6 + 4);
    out[i] = linearToUlaw(Math.round((a + b + c) / 3));
  }
  return out;
}

/** Trim leading/trailing near-silence so the opener starts at once (μ-law 0xFF/0x7F are zero). */
function trimSilence(ulaw: Buffer): Buffer {
  const loud = (byte: number) => { const v = ~byte & 0xff; return (v & 0x70) >= 0x30; }; // exponent ≥ 3
  let start = 0, end = ulaw.length;
  while (start < end && !loud(ulaw[start])) start++;
  while (end > start && !loud(ulaw[end - 1])) end--;
  return ulaw.subarray(Math.max(0, start - 400), Math.min(ulaw.length, end + 1600)); // keep 50 ms before, 200 ms after
}

function cacheFile(text: string): string {
  const key = crypto.createHash("sha256").update(`${VOICE}|${STYLE}|${text}`).digest("hex").slice(0, 16);
  return path.join(DIR, `maril-${key}.ulaw`);
}

async function render(text: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: VOICE, input: text, instructions: STYLE, response_format: "pcm" }),
  });
  if (!r.ok) throw new Error(`speech HTTP ${r.status}`);
  const ulaw = trimSilence(pcm24kToUlaw8k(Buffer.from(await r.arrayBuffer())));
  if (ulaw.length < 8000) throw new Error("speech too short");
  return ulaw;
}

/** Load (or make once) both openers. Never awaited on a call; a call without one just waits for Maril as before. */
export async function warmMarilOpeners(): Promise<void> {
  for (const kind of Object.keys(MARIL_OPENER_TEXT) as MarilOpenerKind[]) {
    try {
      const file = cacheFile(MARIL_OPENER_TEXT[kind]);
      let ulaw: Buffer;
      if (fs.existsSync(file)) ulaw = fs.readFileSync(file);
      else {
        ulaw = await render(MARIL_OPENER_TEXT[kind]);
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(`${file}.part-${process.pid}`, ulaw);
        fs.renameSync(`${file}.part-${process.pid}`, file);
      }
      const list: string[] = [];
      for (let i = 0; i < ulaw.length; i += FRAME_BYTES) list.push(ulaw.subarray(i, i + FRAME_BYTES).toString("base64"));
      frames.set(kind, list);
    } catch (e: any) {
      console.warn(`[Sales Agent] Maril ${kind} opener not ready (calls start with her live greeting):`, e?.message ?? e);
    }
  }
}

/** The opener's 20 ms frames, or null if it isn't ready. */
export function marilOpenerFrames(kind: MarilOpenerKind): string[] | null {
  return frames.get(kind) ?? null;
}
