/**
 * A short "Hello?" that only the AI hears when a call connects (owner, 2026-11-15). GPT-Live is asked to greet first
 * (session.instructions.append), but on real calls her or his voice only started once the caller said something, so
 * callers sat in silence until they said hello. Feeding this clip in as caller audio starts the live greeting at once.
 * The caller never hears it (it goes to OpenAI only) and its transcript line is dropped (isCallerHelloEcho).
 * Made once with OpenAI's speech API, kept in the voice cache as 8 kHz μ-law. Used by Autumn, Tom and Marel.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderSpeechUlaw } from "./marilOpener";

const TEXT = "Hello?";
const VOICE = "ash";
const STYLE = "Someone who just picked up a phone call and is waiting for the other side: a plain, natural, casual hello at normal volume.";
const DIR = process.env.VOICE_CACHE_DIR || "/var/lib/certxa/voice-cache";
const LEAD_IN_BYTES = 2400; // 300 ms of line silence before the word, so the voice detector hears it start
const TAIL_BYTES = 6400; // 800 ms after it, so the turn ends even while caller audio is held back (Marel's hold music)
const CHUNK_BYTES = 1600; // 200 ms per input_audio.append

let chunks: string[] | null = null;

function cacheFile(): string {
  const key = crypto.createHash("sha256").update(`${VOICE}|${STYLE}|${TEXT}`).digest("hex").slice(0, 16);
  return path.join(DIR, `caller-hello-${key}.ulaw`);
}

/** Load (or make once) the clip. Never awaited on a call; without it a call just waits for the caller as before. */
export async function warmCallerHello(): Promise<void> {
  if (chunks) return;
  try {
    const file = cacheFile();
    let ulaw: Buffer;
    if (fs.existsSync(file)) ulaw = fs.readFileSync(file);
    else {
      ulaw = await renderSpeechUlaw(TEXT, VOICE, STYLE, 1600);
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(`${file}.part-${process.pid}`, ulaw);
      fs.renameSync(`${file}.part-${process.pid}`, file);
    }
    const audio = Buffer.concat([Buffer.alloc(LEAD_IN_BYTES, 0xff), ulaw, Buffer.alloc(TAIL_BYTES, 0xff)]); // μ-law 0xFF = silence
    const list: string[] = [];
    for (let i = 0; i < audio.length; i += CHUNK_BYTES) list.push(audio.subarray(i, i + CHUNK_BYTES).toString("base64"));
    chunks = list;
  } catch (e: any) {
    console.warn(`[Caller Hello] clip not ready (calls wait for the caller to speak first):`, e?.message ?? e);
  }
}

/** The clip as base64 μ-law chunks for session.input_audio.append, or null when it isn't ready. */
export function callerHelloChunks(): string[] | null {
  return chunks;
}

/** True for the transcript of the injected clip ("Hello?"), so it is kept out of the call transcript. */
export function isCallerHelloEcho(text: string): boolean {
  return /^\W*(hello|hallo|hi|hey)\W*$/i.test(text.trim());
}
