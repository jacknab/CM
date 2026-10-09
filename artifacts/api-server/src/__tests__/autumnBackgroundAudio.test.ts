import { describe, expect, it } from "vitest";
import {
  downmixAndResample,
  linear16ToMuLaw,
  mixTwilioOutboundFrame,
  muLawToLinear16,
  randomAmbienceStart,
  TWILIO_AUDIO_FRAME_SAMPLES,
  type AutumnBackgroundAudioCursor,
} from "../lib/autumnBackgroundAudio";

describe("Autumn outbound ambience", () => {
  it("downmixes 48kHz stereo to 8kHz mono", () => {
    const left = new Float32Array(48).fill(0.5);
    const right = new Float32Array(48).fill(-0.25);
    const result = downmixAndResample([left, right], 48_000, 8_000);
    expect(result).toHaveLength(8);
    expect(result[0]).toBeGreaterThan(4000);
    expect(result[0]).toBeLessThan(4200);
  });

  it("preserves intelligible AI level while adding conservative ambience", () => {
    const aiSample = 10_000;
    const ai = Buffer.alloc(TWILIO_AUDIO_FRAME_SAMPLES, linear16ToMuLaw(aiSample));
    const cursor: AutumnBackgroundAudioCursor = {
      prepared: { pcm: new Int16Array(640).fill(10_000), crossfadeSamples: 0 },
      position: 0,
      volume: 0.08,
    };
    const mixed = mixTwilioOutboundFrame(ai, cursor);
    expect(mixed).toHaveLength(TWILIO_AUDIO_FRAME_SAMPLES);
    expect(muLawToLinear16(mixed[0])).toBeGreaterThan(muLawToLinear16(ai[0]));
    expect(muLawToLinear16(mixed[0])).toBeLessThan(12_000);
  });

  it("ducks ambience while AI speech is playing", () => {
    const prepared = { pcm: new Int16Array(640).fill(10_000), crossfadeSamples: 0 };
    const ai = Buffer.alloc(TWILIO_AUDIO_FRAME_SAMPLES, linear16ToMuLaw(10_000));
    const full = mixTwilioOutboundFrame(ai, { prepared, position: 0, volume: 0.11 }, 1);
    const ducked = mixTwilioOutboundFrame(ai, { prepared, position: 0, volume: 0.11 }, 0.25);
    expect(muLawToLinear16(ducked[0])).toBeLessThan(muLawToLinear16(full[0]));
    expect(muLawToLinear16(ducked[0])).toBeGreaterThanOrEqual(muLawToLinear16(ai[0]));
  });

  it("loops call-local playback without sharing cursor state", () => {
    const prepared = { pcm: new Int16Array([1000, 2000, 3000, 4000]), crossfadeSamples: 1 };
    const first: AutumnBackgroundAudioCursor = { prepared, position: 0, volume: 0.1 };
    const second: AutumnBackgroundAudioCursor = { prepared, position: 0, volume: 0.1 };
    mixTwilioOutboundFrame(null, first);
    expect(first.position).not.toBe(second.position);
    expect(second.position).toBe(0);
  });

  it("selects a frame-aligned call-specific starting point", () => {
    const prepared = { pcm: new Int16Array(TWILIO_AUDIO_FRAME_SAMPLES * 100), crossfadeSamples: TWILIO_AUDIO_FRAME_SAMPLES };
    const early = randomAmbienceStart(prepared, () => 0.1);
    const late = randomAmbienceStart(prepared, () => 0.9);
    expect(early).not.toBe(late);
    expect(early % TWILIO_AUDIO_FRAME_SAMPLES).toBe(0);
    expect(late % TWILIO_AUDIO_FRAME_SAMPLES).toBe(0);
    expect(late).toBeLessThan(prepared.pcm.length - prepared.crossfadeSamples);
  });

  it("produces silence-compatible μ-law for a zero sample", () => {
    expect(linear16ToMuLaw(0)).toBe(0xff);
    expect(muLawToLinear16(0xff)).toBe(0);
  });
});
