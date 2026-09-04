import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import sharp from "sharp";

const R2_ENDPOINT   = process.env.R2_ENDPOINT   ?? "";
const R2_BUCKET     = process.env.R2_BUCKET_NAME ?? "hia-images";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const APP_URL       = (process.env.APP_URL ?? "").replace(/\/$/, "");

export const R2_PUBLIC_BASE =
  (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "") ||
  `${R2_ENDPOINT.replace(/\/$/, "")}/${R2_BUCKET}`;

function buildPublicUrlFromKey(key: string): string {
  // Preferred: explicit public URL (custom domain / r2.dev)
  if ((process.env.R2_PUBLIC_URL ?? "").trim()) {
    return `${R2_PUBLIC_BASE}/${key}`;
  }

  // Safe fallback for production when bucket endpoint is not publicly readable:
  // route through app proxy endpoint that streams from R2 using credentials.
  if (APP_URL) {
    return `${APP_URL}/api/r2/${key}`;
  }

  // Last-resort local/dev fallback.
  return `/api/r2/${key}`;
}

export function extractR2KeyFromUrl(value: string): string | null {
  if (!value) return null;

  // Absolute public URL based on configured public base
  if (value.startsWith(`${R2_PUBLIC_BASE}/`)) {
    return value.slice(R2_PUBLIC_BASE.length + 1);
  }

  // Relative or absolute API proxy URL
  const apiMarker = "/api/r2/";
  const markerIdx = value.indexOf(apiMarker);
  if (markerIdx >= 0) {
    return value.slice(markerIdx + apiMarker.length);
  }

  return null;
}

export const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

export function isR2Configured(): boolean {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY);
}

// ─── Local disk fallback ──────────────────────────────────────────────────────
// When R2 credentials are not set (dev / no-config environments), uploads are
// saved to <api-server>/uploads/ and served via the existing /uploads static route.

function localUploadsDir(): string {
  try {
    // __dirname = artifacts/api-server/src/lib/  →  ../../uploads = artifacts/api-server/uploads/
    // dist build: __dirname = artifacts/api-server/dist/lib/ → same relative depth
    return path.resolve(__dirname, "../../uploads");
  } catch {
    return path.resolve(process.cwd(), "uploads");
  }
}

async function saveToLocal(buffer: Buffer, folder: string, ext: string): Promise<string> {
  const dir = path.join(localUploadsDir(), folder);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${folder}/${filename}`;
}

/**
 * Convert any image buffer to WebP. Falls back to the original buffer if
 * sharp fails (e.g. SVG inputs that can't be rasterized).
 */
export async function toWebP(buffer: Buffer, quality = 82): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const out = await sharp(buffer).webp({ quality }).toBuffer();
    return { buffer: out, mimeType: "image/webp" };
  } catch {
    return { buffer, mimeType: "image/jpeg" };
  }
}

/**
 * Resize + convert to WebP to create a small square thumbnail.
 * Ideal for calendar avatars (80×80px).
 */
export async function toThumb(buffer: Buffer, size = 80): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, { fit: "cover", position: "attention" })
    .webp({ quality: 75 })
    .toBuffer();
}

/**
 * Upload a raw buffer to R2 (no conversion). Returns the public URL.
 */
async function putR2(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    })
  );
  return buildPublicUrlFromKey(key);
}

export async function getObjectFromR2(key: string, range?: string) {
  return r2.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ...(range ? { Range: range } : {}),
    })
  );
}

/**
 * Upload a buffer to R2, auto-converting JPEG/PNG/GIF/AVIF → WebP first.
 * SVGs are kept as-is. Falls back to local disk when R2 is not configured.
 * Returns the public URL.
 */
export async function uploadToR2(
  buffer: Buffer,
  folder: string,
  originalName: string,
  mimeType: string
): Promise<string> {
  const isSvg = mimeType === "image/svg+xml" || originalName.toLowerCase().endsWith(".svg");

  let finalBuffer = buffer;
  let finalMime   = mimeType;
  let ext         = ".webp";

  if (isSvg) {
    ext       = ".svg";
    finalMime = "image/svg+xml";
  } else {
    const converted = await toWebP(buffer);
    finalBuffer = converted.buffer;
    finalMime   = converted.mimeType;
  }

  if (!isR2Configured()) {
    return saveToLocal(finalBuffer, folder, ext);
  }

  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  return putR2(finalBuffer, key, finalMime);
}

/**
 * If `value` is a base64/URL-encoded `data:` URI, decode it, push it to R2 and
 * return the resulting public URL. Anything else (an existing http URL, null,
 * undefined, empty string) is passed straight through unchanged.
 *
 * Lets endpoints that historically accepted an inline data-URI from the client
 * (e.g. the catalog Category editor) transparently persist real R2 objects
 * instead of bloating the DB row + every API response that returns it.
 */
export async function persistDataUriToR2(
  value: string | null | undefined,
  folder: string,
): Promise<string | null | undefined> {
  if (typeof value !== "string" || !value.startsWith("data:")) return value;
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return value;
  const mime = match[1] || "image/png";
  const isBase64 = !!match[2];
  const buffer = isBase64
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  if (!buffer.length) return value;
  const ext = (mime.split("/")[1] || "png").split("+")[0];
  return uploadToR2(buffer, folder, `upload.${ext}`, mime);
}

/**
 * Upload an avatar to R2 and also generate an 80×80 WebP thumbnail.
 * Falls back to local disk when R2 is not configured.
 * Returns { avatarUrl, thumbUrl }.
 */
export async function uploadAvatarToR2(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ avatarUrl: string; thumbUrl: string }> {
  const [avatarUrl, thumbBuf] = await Promise.all([
    uploadToR2(buffer, "avatars", originalName, mimeType),
    toThumb(buffer, 80),
  ]);

  const thumbUrl = isR2Configured()
    ? await putR2(thumbBuf, `avatars/thumbs/${crypto.randomUUID()}.webp`, "image/webp")
    : await saveToLocal(thumbBuf, "avatars/thumbs", ".webp");

  return { avatarUrl, thumbUrl };
}

/**
 * Delete an object from R2 given its full public URL.
 * Silently succeeds if the URL doesn't belong to this bucket.
 */
export async function deleteFromR2(publicUrl: string): Promise<void> {
  const key = extractR2KeyFromUrl(publicUrl);
  if (!key) return;
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {
    // Non-fatal — object may already be gone
  }
}

/**
 * multer middleware that stores files in memory (so we can stream to R2 or disk).
 */
export const memoryUpload = (opts: { maxSizeMb?: number } = {}) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: (opts.maxSizeMb ?? 5) * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) cb(null, true);
      else cb(new Error("Only image files are allowed"));
    },
  });
