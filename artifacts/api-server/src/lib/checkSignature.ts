/**
 * Check signatures — turn a phone photo of a signature on paper into a clean, transparent PNG that
 * prints over a check's signature line, and keep it privately on disk for its store.
 *
 * Everything runs in-process on sharp (libvips); the photo never leaves this server. Pipeline:
 *   1. auto-rotate (EXIF), put it on white (a transparent PNG's clear pixels are stored as black), and
 *      scale to a working size
 *   2. flatten the lighting: divide by a heavily blurred copy, so shadows and uneven paper turn white
 *   3. Otsu threshold on the flattened ink darkness (with a floor, so paper grain is never "ink")
 *   4. keep only real ink strokes: drop specks, and drop what touches the photo's edge only when it
 *      looks like the table / a finger (a solid blob) or the paper's own edge (a thin band hugging a
 *      side). A signature stroke that simply runs to the edge of a tightly cropped image is kept.
 *   5. crop tight around what's left, and build the PNG: one dark ink colour, alpha = how dark the
 *      ink is (smooth, anti-aliased edges), fully transparent everywhere else
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WORK_MAX = 2000;          // longest side processed — plenty for a signature, fast to scan
const OUT_MAX_WIDTH = 1200;     // stored width; the check prints it ~2.2" wide (~550 dpi)
const INK = { r: 17, g: 24, b: 39 }; // #111827 — the check's own ink colour

export class SignatureError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}

export const signatureDir = () => process.env.CHECK_SIGNATURE_DIR || "/var/lib/certxa/check-signatures";
export const signaturePath = (storeId: number) => path.join(signatureDir(), `store-${Number(storeId)}.png`);

/** Otsu's threshold over a 256-bin histogram. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) { bestVar = between; best = t; }
  }
  return best;
}

export interface ProcessedSignature { png: Buffer; width: number; height: number }

/** Photo of a signature on paper → transparent PNG of just the ink. Throws SignatureError with a message for the owner. */
export async function processSignaturePhoto(photo: Buffer): Promise<ProcessedSignature> {
  let gray: Buffer, width: number, height: number;
  try {
    const { data, info } = await sharp(photo, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: WORK_MAX, height: WORK_MAX, fit: "inside", withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    gray = data; width = info.width; height = info.height;
  } catch {
    // (This sharp build reads JPEG/PNG/WebP/AVIF but not HEIC — an iPhone converts to JPEG when uploading from the
    // page itself; only a raw .heic file copied off the phone lands here.)
    throw new SignatureError("That photo couldn't be read. Try again with a JPG or PNG photo (a .heic file from an iPhone won't work — take the photo from this page on the phone instead).", 415);
  }
  if (width < 200 || height < 100) throw new SignatureError("That photo is too small. Take it closer to the signature.");

  // 2. Lighting: blur hard enough that pen strokes vanish, leaving only the paper's own brightness.
  const sigma = Math.max(8, Math.round(Math.max(width, height) / 60));
  const background = await sharp(gray, { raw: { width, height, channels: 1 } }).blur(sigma).raw().toBuffer();
  const n = width * height;
  const dark = new Uint8Array(n); // 0 = paper, 255 = darkest ink
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const bg = Math.max(1, background[i]);
    const flat = Math.min(255, Math.round((gray[i] / bg) * 255));
    const d = 255 - flat;
    dark[i] = d;
    hist[d]++;
  }

  // 3. Ink threshold — never below 40 so paper texture and faint shadows stay paper.
  const threshold = Math.max(40, otsu(hist, n));
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = dark[i] >= threshold ? 1 : 0;

  // 4. Connected strokes (8-way). Keep the real ones; mark the rest as paper.
  const label = new Int32Array(n);
  const minArea = Math.max(12, Math.round(n * 0.00002));
  const stack = new Int32Array(n);
  let next = 0;
  let kept = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  const keep = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (!ink[start] || label[start]) continue;
    next++;
    let top = 0; stack[top++] = start; label[start] = next;
    const members: number[] = [];
    let touchesEdge = false, cMinX = width, cMinY = height, cMaxX = -1, cMaxY = -1;
    while (top > 0) {
      const p = stack[--top];
      members.push(p);
      const x = p % width, y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      if (x < cMinX) cMinX = x; if (x > cMaxX) cMaxX = x; if (y < cMinY) cMinY = y; if (y > cMaxY) cMaxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (ink[q] && !label[q]) { label[q] = next; stack[top++] = q; }
        }
      }
    }
    if (members.length < minArea) continue;
    if (touchesEdge) {
      const bw = cMaxX - cMinX + 1, bh = cMaxY - cMinY + 1;
      const solid = members.length / (bw * bh) > 0.35;               // table, finger, dark shadow
      const hugsEdge = (bh <= height * 0.08 && bw >= width * 0.5) ||    // paper edge along the top/bottom
        (bw <= width * 0.08 && bh >= height * 0.5);                       // …or down a side
      if (solid || hugsEdge) continue;
    }
    for (const p of members) keep[p] = 1;
    kept += members.length;
    if (cMinX < minX) minX = cMinX; if (cMaxX > maxX) maxX = cMaxX; if (cMinY < minY) minY = cMinY; if (cMaxY > maxY) maxY = cMaxY;
  }
  if (maxX < 0) throw new SignatureError("No signature found. Sign in dark pen on plain white paper and fill most of the photo with it.");
  const boxW = maxX - minX + 1, boxH = maxY - minY + 1;
  if (boxW < 60 || boxH < 15) throw new SignatureError("The signature is too small in the photo. Move the phone closer.");
  if (kept / (boxW * boxH) > 0.45) throw new SignatureError("That doesn't look like a signature on white paper — too much of the photo is dark. Retake it on plain white paper in good light.");

  // 5. Crop with a little padding; alpha follows ink darkness, but only on and right beside kept strokes.
  const pad = Math.round(Math.max(boxW, boxH) * 0.03) + 4;
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const x1 = Math.min(width - 1, maxX + pad), y1 = Math.min(height - 1, maxY + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const lo = threshold * 0.55, hi = Math.min(255, threshold * 1.6 + 20);
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = x + x0, sy = y + y0, i = sy * width + sx;
      // The anti-aliased fringe of a kept stroke is just below the threshold — let a 1px ring through.
      let near = keep[i] === 1;
      if (!near) {
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
          const nx = sx + dx, ny = sy + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && keep[ny * width + nx]) near = true;
        }
      }
      const o = (y * cw + x) * 4;
      rgba[o] = INK.r; rgba[o + 1] = INK.g; rgba[o + 2] = INK.b;
      rgba[o + 3] = near ? Math.round(Math.max(0, Math.min(1, (dark[i] - lo) / (hi - lo))) * 255) : 0;
    }
  }
  const png = await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
    .resize({ width: Math.min(OUT_MAX_WIDTH, cw), withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { png: png.data, width: png.info.width, height: png.info.height };
}

/**
 * Validate a signature PNG the owner approved (the one processSignaturePhoto gave them) and re-encode
 * it, so only a clean, reasonably sized transparent PNG is ever written to disk.
 */
export async function sanitizeSignaturePng(input: Buffer): Promise<Buffer> {
  let meta: sharp.Metadata;
  try { meta = await sharp(input).metadata(); } catch { throw new SignatureError("That isn't a valid signature image.", 400); }
  if (meta.format !== "png" || !meta.hasAlpha) throw new SignatureError("The signature must be the processed transparent PNG.", 400);
  if (!meta.width || !meta.height || meta.width > 2400 || meta.height > 1200) throw new SignatureError("The signature image is too large.", 400);
  return sharp(input).png({ compressionLevel: 9 }).toBuffer();
}

/** Write atomically (temp file + rename) and private to the server process. */
export async function saveSignature(storeId: number, png: Buffer): Promise<void> {
  await fs.promises.mkdir(signatureDir(), { recursive: true, mode: 0o700 });
  const target = signaturePath(storeId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, png, { mode: 0o600 });
  await fs.promises.rename(tmp, target);
}

export async function deleteSignature(storeId: number): Promise<boolean> {
  // The placement goes with it — a future signature starts back at the default spot and size.
  await fs.promises.unlink(placementPath(storeId)).catch(() => {});
  try { await fs.promises.unlink(signaturePath(storeId)); return true; }
  catch (err: any) { if (err?.code === "ENOENT") return false; throw err; }
}

// ── Placement: the owner's small nudge up/down and size tweak over the signature line ──────────────
/** offsetPx: CSS px on the printed check (96/in), + = lower. scale: size relative to the default 2.2" width. */
export interface SignaturePlacement { offsetPx: number; scale: number }
export const DEFAULT_PLACEMENT: SignaturePlacement = { offsetPx: 0, scale: 1 };
export const PLACEMENT_LIMITS = { offsetPx: 20, minScale: 0.7, maxScale: 1.3 } as const;
export const placementPath = (storeId: number) => path.join(signatureDir(), `store-${Number(storeId)}.json`);

/** Clamp to the allowed range (±20px, 70–130% in 5% steps); anything unreadable becomes the default. */
export function normalizePlacement(raw: unknown): SignaturePlacement {
  const o = Number((raw as any)?.offsetPx), sc = Number((raw as any)?.scale);
  const offsetPx = Number.isFinite(o) ? Math.max(-PLACEMENT_LIMITS.offsetPx, Math.min(PLACEMENT_LIMITS.offsetPx, Math.round(o))) : 0;
  const scale = Number.isFinite(sc)
    ? Math.round(Math.max(PLACEMENT_LIMITS.minScale, Math.min(PLACEMENT_LIMITS.maxScale, sc)) * 20) / 20
    : 1;
  return { offsetPx, scale };
}

export async function readPlacement(storeId: number): Promise<SignaturePlacement> {
  try { return normalizePlacement(JSON.parse(await fs.promises.readFile(placementPath(storeId), "utf8"))); }
  catch { return { ...DEFAULT_PLACEMENT }; }
}

export async function savePlacement(storeId: number, placement: SignaturePlacement): Promise<SignaturePlacement> {
  const clean = normalizePlacement(placement);
  await fs.promises.mkdir(signatureDir(), { recursive: true, mode: 0o700 });
  const target = placementPath(storeId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(clean), { mode: 0o600 });
  await fs.promises.rename(tmp, target);
  return clean;
}
