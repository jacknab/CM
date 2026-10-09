import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";

export const TWILIO_AUDIO_SAMPLE_RATE = 8_000;
export const TWILIO_AUDIO_FRAME_SAMPLES = 160;

export interface AutumnBackgroundAudioConfig {
  enabled: boolean;
  file: string;
  volume: number;
}

interface PreparedAmbience {
  pcm: Int16Array;
  crossfadeSamples: number;
}

export interface AutumnBackgroundAudioCursor {
  prepared: PreparedAmbience;
  position: number;
  volume: number;
}

let preparedAmbiencePromise: Promise<PreparedAmbience | null> | null = null;

export function readAutumnBackgroundAudioConfig(): AutumnBackgroundAudioConfig {
  const enabled = /^(1|true|yes|on)$/i.test(process.env.AUTUMN_BACKGROUND_AUDIO_ENABLED?.trim() ?? "");
  const requestedVolume = Number(process.env.AUTUMN_BACKGROUND_AUDIO_VOLUME ?? "0.11");
  return {
    enabled,
    file: path.resolve(process.env.AUTUMN_BACKGROUND_AUDIO_FILE?.trim() || path.join(process.cwd(), "Ambience.mp3")),
    // The ambience is deliberately capped: it is environmental texture, never foreground audio.
    volume: Number.isFinite(requestedVolume) ? Math.max(0, Math.min(0.3, requestedVolume)) : 0.11,
  };
}

/**
 * Initializes one call-local playback cursor over an immutable decoded buffer.
 * Decoding is lazy and shared across calls; playback position is never shared.
 */
export async function createAutumnBackgroundAudioCursor(
  config = readAutumnBackgroundAudioConfig(),
): Promise<AutumnBackgroundAudioCursor | null> {
  if (!config.enabled || config.volume <= 0) return null;
  if (!preparedAmbiencePromise) preparedAmbiencePromise = prepareAmbience(config.file);
  const prepared = await preparedAmbiencePromise;
  return prepared ? { prepared, position: randomAmbienceStart(prepared), volume: config.volume } : null;
}

/**
 * Give every call a different part of the ambience recording without doing network I/O or
 * decoding another MP3. Starts are aligned to Twilio's 20ms frame boundary and avoid the loop's
 * crossfade tail. A long source recording therefore sounds like a fresh salon soundscape per call.
 */
export function randomAmbienceStart(
  prepared: PreparedAmbience,
  random: () => number = Math.random,
): number {
  const usableSamples = Math.max(0, prepared.pcm.length - prepared.crossfadeSamples);
  const frameCount = Math.floor(usableSamples / TWILIO_AUDIO_FRAME_SAMPLES);
  if (frameCount <= 1) return 0;
  const normalizedRandom = Math.max(0, Math.min(0.999999999, random()));
  return Math.floor(normalizedRandom * frameCount) * TWILIO_AUDIO_FRAME_SAMPLES;
}

/** Decode during server startup so the first caller does not wait ~4 seconds for ambience. */
export async function warmAutumnBackgroundAudio(): Promise<void> {
  const config = readAutumnBackgroundAudioConfig();
  if (!config.enabled) {
    console.log("[Autumn ambience] Disabled by configuration");
    return;
  }
  const cursor = await createAutumnBackgroundAudioCursor(config);
  if (cursor) console.log(`[Autumn ambience] Prewarmed and enabled at volume=${config.volume}`);
}

async function prepareAmbience(file: string): Promise<PreparedAmbience | null> {
  try {
    const cacheFile = process.env.AUTUMN_BACKGROUND_AUDIO_CACHE_FILE?.trim()
      || "/var/cache/certxa/autumn-ambience-8khz-mono-s16le.pcm";
    const cached = await readPreparedCache(file, cacheFile);
    if (cached) {
      const cacheNormalizationGain = normalizeQuietPcmInPlace(cached);
      console.log(
        `[Autumn ambience] Ready from PCM cache — output=${TWILIO_AUDIO_SAMPLE_RATE}Hz/mono ` +
        `duration=${(cached.length / TWILIO_AUDIO_SAMPLE_RATE).toFixed(1)}s ` +
        `normalization=${cacheNormalizationGain.toFixed(1)}x file=${cacheFile}`,
      );
      return { pcm: cached, crossfadeSamples: Math.min(320, Math.floor(cached.length / 4)) };
    }

    const encoded = await readFile(file);
    // A full decode of this long MP3 takes several seconds. Keep it entirely off
    // the API event loop so first-call setup, Twilio media, and GPT-Live remain responsive.
    const decoded = await decodeAndResampleInWorker(encoded, TWILIO_AUDIO_SAMPLE_RATE);
    const pcm = new Int16Array(decoded.pcm);
    if (pcm.length < TWILIO_AUDIO_FRAME_SAMPLES) throw new Error("decoded ambience is shorter than one Twilio frame");
    if (decoded.errorCount) {
      console.warn(`[Autumn ambience] MP3 decoded with ${decoded.errorCount} recoverable warning(s)`);
    }
    console.log(
      `[Autumn ambience] Ready — source=${decoded.sourceRate}Hz/${decoded.channels}ch ` +
      `output=${TWILIO_AUDIO_SAMPLE_RATE}Hz/mono duration=${(pcm.length / TWILIO_AUDIO_SAMPLE_RATE).toFixed(1)}s ` +
      `normalization=${decoded.normalizationGain.toFixed(1)}x file=${file}`,
    );
    // Persist the expensive conversion. The API process has a 1GB memory
    // restart limit; decoding 12+ minutes of stereo Float32 on every startup
    // creates a large temporary RSS spike. Future starts load only this 12MB PCM.
    await writePreparedCache(cacheFile, pcm).catch((error) =>
      console.warn(`[Autumn ambience] Could not write PCM cache ${cacheFile}:`, error),
    );
    return { pcm, crossfadeSamples: Math.min(320, Math.floor(pcm.length / 4)) }; // 40ms at 8kHz
  } catch (error) {
    console.error(`[Autumn ambience] Disabled for calls: failed to prepare ${file}:`, error);
    return null;
  }
}

/**
 * Peak-only normalization is unreliable for environmental recordings: one
 * isolated transient can be loud while the remaining ambience is effectively
 * inaudible after the caller-facing gain and G.711 companding are applied.
 * Bring unusually quiet prepared PCM to a conservative RMS target. The hard
 * limiter only catches rare transients and keeps the bed well below speech.
 */
function normalizeQuietPcmInPlace(pcm: Int16Array): number {
  if (pcm.length === 0) return 1;
  let sumSquares = 0;
  for (let i = 0; i < pcm.length; i++) sumSquares += pcm[i] * pcm[i];
  const rms = Math.sqrt(sumSquares / pcm.length);
  const targetRms = 1_800;
  const gain = rms > 0 && rms < targetRms ? Math.min(8, targetRms / rms) : 1;
  if (gain <= 1) return 1;
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * gain)));
  }
  return gain;
}

async function readPreparedCache(sourceFile: string, cacheFile: string): Promise<Int16Array | null> {
  try {
    const [sourceInfo, cacheInfo] = await Promise.all([stat(sourceFile), stat(cacheFile)]);
    if (cacheInfo.mtimeMs < sourceInfo.mtimeMs || cacheInfo.size < TWILIO_AUDIO_FRAME_SAMPLES * 2 || cacheInfo.size % 2) return null;
    const bytes = await readFile(cacheFile);
    // Copy into an exactly-sized ArrayBuffer; Buffer pools may have a non-zero offset.
    const copy = Uint8Array.from(bytes);
    return new Int16Array(copy.buffer);
  } catch {
    return null;
  }
}

async function writePreparedCache(cacheFile: string, pcm: Int16Array): Promise<void> {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  const temporary = `${cacheFile}.${process.pid}.tmp`;
  await writeFile(temporary, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  await rename(temporary, cacheFile);
  console.log(`[Autumn ambience] Wrote prepared PCM cache — ${cacheFile}`);
}

function decodeAndResampleInWorker(
  encoded: Buffer,
  targetRate: number,
): Promise<{ pcm: ArrayBuffer; sourceRate: number; channels: number; errorCount: number; normalizationGain: number }> {
  const workerSource = `
    const { parentPort, workerData } = require("node:worker_threads");
    (async () => {
      const { MPEGDecoder } = await import("mpg123-decoder");
      const decoder = new MPEGDecoder({ enableGapless: true });
      try {
        await decoder.ready;
        const decoded = decoder.decode(new Uint8Array(workerData.encoded));
        const channels = decoded.channelData;
        if (!channels.length || !decoded.samplesDecoded || !decoded.sampleRate) throw new Error("decoder returned no audio samples");
        const sourceLength = Math.min(...channels.map((channel) => channel.length));
        const outputLength = Math.floor(sourceLength * workerData.targetRate / decoded.sampleRate);
        const output = new Int16Array(outputLength);
        for (let out = 0; out < outputLength; out++) {
          const sourceStart = Math.floor(out * decoded.sampleRate / workerData.targetRate);
          const sourceEnd = Math.max(sourceStart + 1, Math.floor((out + 1) * decoded.sampleRate / workerData.targetRate));
          let sum = 0, count = 0;
          for (let source = sourceStart; source < sourceEnd && source < sourceLength; source++) {
            for (const channel of channels) { sum += channel[source]; count++; }
          }
          const normalized = count ? Math.max(-1, Math.min(1, sum / count)) : 0;
          output[out] = Math.round(normalized * (normalized < 0 ? 32768 : 32767));
        }
        // This particular environmental recording is mastered extremely quietly
        // (roughly -43 dBFS RMS). Normalize its peak once during preparation so
        // AUTUMN_BACKGROUND_AUDIO_VOLUME remains a useful caller-facing gain.
        // The configured 0.08 then places ambience about 22 dB below full scale.
        let peak = 0;
        for (let i = 0; i < output.length; i++) peak = Math.max(peak, Math.abs(output[i]));
        const normalizationGain = peak > 0 ? Math.min(16, 24000 / peak) : 1;
        if (normalizationGain > 1) {
          for (let i = 0; i < output.length; i++) {
            output[i] = Math.max(-32768, Math.min(32767, Math.round(output[i] * normalizationGain)));
          }
        }
        parentPort.postMessage({
          ok: true, pcm: output.buffer, sourceRate: decoded.sampleRate,
          channels: channels.length, errorCount: decoded.errors.length, normalizationGain,
        }, [output.buffer]);
      } finally { decoder.free(); }
    })().catch((error) => parentPort.postMessage({ ok: false, error: error && error.message ? error.message : String(error) }));
  `;

  return new Promise((resolve, reject) => {
    // Transfer a private copy to avoid retaining the 5.9MB encoded file while
    // the worker decodes; no call audio or session state enters this worker.
    const transferable = Uint8Array.from(encoded).buffer;
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { encoded: transferable, targetRate },
      transferList: [transferable],
    });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error("MP3 preparation timed out after 30 seconds"));
    }, 30_000);
    worker.once("message", (message: { ok: boolean; error?: string; pcm?: ArrayBuffer; sourceRate?: number; channels?: number; errorCount?: number; normalizationGain?: number }) => {
      clearTimeout(timeout);
      void worker.terminate();
      if (!message.ok || !message.pcm) reject(new Error(message.error || "MP3 worker failed"));
      else resolve({
        pcm: message.pcm,
        sourceRate: message.sourceRate!,
        channels: message.channels!,
        errorCount: message.errorCount ?? 0,
        normalizationGain: message.normalizationGain ?? 1,
      });
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`MP3 worker exited with code ${code}`));
      }
    });
  });
}

/** Window-averaged resampling also acts as the required anti-alias low-pass for 48kHz → 8kHz. */
export function downmixAndResample(channels: Float32Array[], sourceRate: number, targetRate: number): Int16Array {
  if (!channels.length || sourceRate <= 0 || targetRate <= 0) return new Int16Array();
  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  const outputLength = Math.floor(sourceLength * targetRate / sourceRate);
  const output = new Int16Array(outputLength);

  for (let out = 0; out < outputLength; out++) {
    const sourceStart = Math.floor(out * sourceRate / targetRate);
    const sourceEnd = Math.max(sourceStart + 1, Math.floor((out + 1) * sourceRate / targetRate));
    let sum = 0;
    let count = 0;
    for (let source = sourceStart; source < sourceEnd && source < sourceLength; source++) {
      for (const channel of channels) {
        sum += channel[source];
        count++;
      }
    }
    const normalized = count ? Math.max(-1, Math.min(1, sum / count)) : 0;
    output[out] = Math.round(normalized * (normalized < 0 ? 32768 : 32767));
  }
  return output;
}

/** Mix one 20ms ambience frame under an optional GPT-Live μ-law frame. */
export function mixTwilioOutboundFrame(
  aiUlaw: Buffer | null,
  cursor: AutumnBackgroundAudioCursor,
  ambienceGain = 1,
): Buffer {
  const outputLength = aiUlaw?.length || TWILIO_AUDIO_FRAME_SAMPLES;
  const output = Buffer.allocUnsafe(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const aiPcm = aiUlaw && i < aiUlaw.length ? muLawToLinear16(aiUlaw[i]) : 0;
    const ambiencePcm = nextAmbienceSample(cursor) * cursor.volume * Math.max(0, ambienceGain);
    const mixed = Math.max(-32768, Math.min(32767, Math.round(aiPcm + ambiencePcm)));
    output[i] = linear16ToMuLaw(mixed);
  }
  return output;
}

function nextAmbienceSample(cursor: AutumnBackgroundAudioCursor): number {
  const { pcm, crossfadeSamples } = cursor.prepared;
  if (cursor.position >= pcm.length) cursor.position = crossfadeSamples;
  const position = cursor.position++;
  const fadeStart = pcm.length - crossfadeSamples;
  if (crossfadeSamples > 0 && position >= fadeStart) {
    const offset = position - fadeStart;
    const blend = offset / crossfadeSamples;
    return pcm[position] * (1 - blend) + pcm[offset] * blend;
  }
  return pcm[position];
}

export function muLawToLinear16(muLawByte: number): number {
  const value = (~muLawByte) & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  const sample = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return sign ? -sample : sample;
}

export function linear16ToMuLaw(input: number): number {
  const sign = input < 0 ? 0x80 : 0;
  let sample = Math.min(32635, Math.abs(Math.round(input))) + 0x84;
  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (sample & mask) === 0; exponent--, mask >>= 1) { /* scan */ }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}
