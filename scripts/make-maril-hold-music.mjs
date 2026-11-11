// Maril's hold music (owner, 2026-11-11): 8 seconds of a Twilio hold track, faded in and out, as 8 kHz μ-law for the
// call stream. Usage: node scripts/make-maril-hold-music.mjs <track.mp3> [seconds=8] [startAt=0]
// Writes /var/lib/certxa/voice-cache/maril-hold-music.ulaw (lib/marilOpener.ts plays it before Maril's opener).
import fs from "node:fs";
import { createRequire } from "node:module";
// mpg123-decoder is an api-server dependency.
const { MPEGDecoder } = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url))("mpg123-decoder");

const [src, secondsArg = "8", startArg = "0"] = process.argv.slice(2);
if (!src) { console.error("usage: make-maril-hold-music.mjs <track.mp3> [seconds] [startAt]"); process.exit(1); }
const seconds = Number(secondsArg), startAt = Number(startArg);
const out = (process.env.VOICE_CACHE_DIR || "/var/lib/certxa/voice-cache") + "/maril-hold-music.ulaw";

const decoder = new MPEGDecoder();
await decoder.ready;
const { channelData, sampleRate } = decoder.decode(new Uint8Array(fs.readFileSync(src)));
decoder.free();
const mono = channelData.length > 1 ? channelData[0].map((v, i) => (v + channelData[1][i]) / 2) : channelData[0];

const OUT_RATE = 8000, n = Math.floor(seconds * OUT_RATE), step = sampleRate / OUT_RATE, first = Math.floor(startAt * sampleRate);
const fadeIn = 0.3 * OUT_RATE, fadeOut = 1.2 * OUT_RATE;
function ulaw(sample) {
  const BIAS = 0x84, CLIP = 32635, sign = sample < 0 ? 0x80 : 0;
  let s = Math.min(Math.abs(sample), CLIP) + BIAS, exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  return ~(sign | (exponent << 4) | ((s >> (exponent + 3)) & 0x0f)) & 0xff;
}
const pcm = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const a = first + Math.floor(i * step), b = Math.min(mono.length, first + Math.floor((i + 1) * step));
  let sum = 0; for (let j = a; j < b; j++) sum += mono[j] ?? 0;
  pcm[i] = sum / Math.max(1, b - a);
}
// Level it a little under speech: RMS 0.06 of full scale, never past 0.9 at the peaks.
let sq = 0, peak = 0; for (const v of pcm) { sq += v * v; peak = Math.max(peak, Math.abs(v)); }
const gain = Math.min(0.06 / Math.sqrt(sq / n || 1e-9), 0.9 / (peak || 1));
const buf = Buffer.alloc(n);
for (let i = 0; i < n; i++) buf[i] = ulaw(Math.round(pcm[i] * gain * Math.min(1, i / fadeIn, (n - i) / fadeOut) * 32767));
fs.mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out}: ${(n / OUT_RATE).toFixed(1)} s from ${src} @ ${startAt}s (source ${sampleRate} Hz)`);
