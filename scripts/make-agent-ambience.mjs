// Tom and Marel's background (owner, 2026-11-11): a long recording, cut to a few minutes of 8 kHz mono 16-bit PCM so the
// API never decodes a huge MP3 (a 2-hour file would need gigabytes). Calls start at a random point and loop it.
// Usage: node scripts/make-agent-ambience.mjs <recording.mp3> [minutes=15] [startAtMinute=10] [out]
import fs from "node:fs";
import { createRequire } from "node:module";
const { MPEGDecoder } = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url))("mpg123-decoder");

const [src, minutesArg = "15", startArg = "10", outArg] = process.argv.slice(2);
if (!src) { console.error("usage: make-agent-ambience.mjs <recording.mp3> [minutes] [startAtMinute] [out]"); process.exit(1); }
const out = outArg || "/var/lib/certxa/voice-cache/agent-ambience-8khz-mono-s16le.pcm";
const OUT_RATE = 8000, want = Math.round(Number(minutesArg) * 60 * OUT_RATE), startSec = Number(startArg) * 60;

const decoder = new MPEGDecoder({ enableGapless: true });
await decoder.ready;
const fd = fs.openSync(src, "r"), chunk = Buffer.alloc(1 << 20);
const pcm = new Float32Array(want);
let rate = 0, srcIndex = 0, outIndex = 0, sum = 0, count = 0, current = -1, firstSrc = 0;
for (let read; outIndex < want && (read = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0;) {
  const d = decoder.decode(new Uint8Array(chunk.subarray(0, read)));
  if (!d.samplesDecoded) continue;
  if (!rate) { rate = d.sampleRate; firstSrc = Math.floor(startSec * rate); }
  const ch = d.channelData, n = Math.min(...ch.map((c) => c.length)), ratio = rate / OUT_RATE;
  for (let i = 0; i < n && outIndex < want; i++, srcIndex++) {
    if (srcIndex < firstSrc) continue;
    let v = 0; for (const c of ch) v += c[i]; v /= ch.length;
    const k = Math.floor((srcIndex - firstSrc) / ratio);
    if (k !== current && current >= 0) { pcm[outIndex++] = count ? sum / count : 0; sum = 0; count = 0; }
    current = k; sum += v; count++;
  }
}
fs.closeSync(fd); decoder.free();
const got = outIndex;
if (got < OUT_RATE * 30) { console.error(`only ${got / OUT_RATE}s decoded — is the start past the end?`); process.exit(1); }
// Level: RMS about 2700 of 32767 (the call-centre recording's level that callers heard first), peaks limited.
let sq = 0; for (let i = 0; i < got; i++) sq += pcm[i] * pcm[i];
const gain = (2700 / 32767) / Math.sqrt(sq / got || 1e-12);
const s16 = new Int16Array(got);
for (let i = 0; i < got; i++) s16[i] = Math.max(-30000, Math.min(30000, Math.round(pcm[i] * gain * 32767)));
fs.mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(`${out}.tmp`, Buffer.from(s16.buffer)); fs.renameSync(`${out}.tmp`, out);
console.log(`wrote ${out}: ${(got / OUT_RATE / 60).toFixed(1)} min from ${src} @ ${startArg} min (source ${rate} Hz, gain ${gain.toFixed(2)})`);
