import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { processSignaturePhoto, sanitizeSignaturePng, SignatureError } from "../lib/checkSignature";

/**
 * A realistic "phone photo": off-white paper lit unevenly (bright top-left, dim bottom-right), a dark
 * table edge along the bottom, a few pencil-dot specks, and a signature in blue-black pen — as a JPEG.
 */
async function phonePhoto(opts: { signature?: boolean } = {}): Promise<Buffer> {
  const w = 1600, h = 1200;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="light" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4f1ea"/><stop offset="1" stop-color="#9c978c"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#light)"/>
    <rect y="${h - 90}" width="${w}" height="90" fill="#3b2f25"/>
    <circle cx="200" cy="200" r="1.5" fill="#555"/><circle cx="1300" cy="300" r="1.5" fill="#555"/>
    ${opts.signature === false ? "" : `<g fill="none" stroke="#1b2140" stroke-width="7" stroke-linecap="round">
      <path d="M300 640 C 420 560, 520 700, 640 600 S 820 540, 900 640 S 1100 700, 1250 560"/>
      <path d="M380 700 L 1300 660"/><path d="M620 480 L 600 700"/></g>`}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

describe("processSignaturePhoto", () => {
  test("keeps only the signature: tight crop, transparent paper, table edge and specks removed", async () => {
    const out = await processSignaturePhoto(await phonePhoto());
    const meta = await sharp(out.png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    // Cropped to the ink (the strokes span ~1000×220 of the 1600×1200 photo), not the whole page.
    expect(out.width).toBeGreaterThan(800);
    expect(out.width / out.height).toBeGreaterThan(3);
    const { data, info } = await sharp(out.png).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    // Corners are paper → fully transparent; plenty of solid ink exists.
    expect([alpha(0, 0), alpha(info.width - 1, 0), alpha(0, info.height - 1), alpha(info.width - 1, info.height - 1)]).toEqual([0, 0, 0, 0]);
    let solid = 0, clear = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] > 200) solid++; if (data[i] === 0) clear++; }
    expect(solid).toBeGreaterThan(2000);
    expect(clear / (info.width * info.height)).toBeGreaterThan(0.8);
  });

  test("a transparent PNG (black ink on a clear background) keeps every stroke", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="380">
      <g fill="none" stroke="#000" stroke-width="9" stroke-linecap="round">
        <path d="M60 340 L 330 40"/><path d="M500 300 C 560 120, 640 120, 700 300"/><path d="M800 300 L 1200 280"/></g></svg>`;
    const out = await processSignaturePhoto(await sharp(Buffer.from(svg)).png().toBuffer());
    // All three strokes survive: the crop spans from the first stroke (x≈60) to the last (x≈1200).
    expect(out.width).toBeGreaterThan(1000);
    const { data, info } = await sharp(out.png).raw().toBuffer({ resolveWithObject: true });
    const inkInLeftTenth = (() => { let n = 0; for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width / 10; x++) if (data[(y * info.width + x) * 4 + 3] > 200) n++; return n; })();
    expect(inkInLeftTenth).toBeGreaterThan(50);
  });

  test("a tightly cropped signature whose first stroke runs to the image edge keeps that stroke", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="300"><rect width="1000" height="300" fill="#fff"/>
      <g fill="none" stroke="#111" stroke-width="8" stroke-linecap="butt">
        <path d="M0 290 L 250 20"/><path d="M400 250 C 480 80, 560 80, 640 250"/><path d="M700 240 L 960 230"/></g></svg>`;
    const out = await processSignaturePhoto(await sharp(Buffer.from(svg)).png().toBuffer());
    expect(out.width).toBeGreaterThan(900);
  });

  test("a photo of blank paper is refused with a message for the owner", async () => {
    await expect(processSignaturePhoto(await phonePhoto({ signature: false }))).rejects.toBeInstanceOf(SignatureError);
  });

  test("something that isn't an image is refused", async () => {
    await expect(processSignaturePhoto(Buffer.from("not an image"))).rejects.toMatchObject({ status: 415 });
  });
});

describe("sanitizeSignaturePng", () => {
  test("accepts the processed transparent PNG and rejects an opaque JPEG", async () => {
    const out = await processSignaturePhoto(await phonePhoto());
    expect((await sharp(await sanitizeSignaturePng(out.png)).metadata()).hasAlpha).toBe(true);
    await expect(sanitizeSignaturePng(await phonePhoto())).rejects.toBeInstanceOf(SignatureError);
  });
});

describe("normalizePlacement", () => {
  test("keeps the nudge within ±20px and the size within 70–130% in 5% steps", async () => {
    const { normalizePlacement } = await import("../lib/checkSignature");
    expect(normalizePlacement({ offsetPx: 7.4, scale: 1.12 })).toEqual({ offsetPx: 7, scale: 1.1 });
    expect(normalizePlacement({ offsetPx: -80, scale: 5 })).toEqual({ offsetPx: -20, scale: 1.3 });
    expect(normalizePlacement({ offsetPx: 99, scale: 0.1 })).toEqual({ offsetPx: 20, scale: 0.7 });
    expect(normalizePlacement(null)).toEqual({ offsetPx: 0, scale: 1 });
    expect(normalizePlacement({ offsetPx: "x", scale: "y" })).toEqual({ offsetPx: 0, scale: 1 });
  });
});
