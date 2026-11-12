/**
 * Hairstyle reference images — where the files live (Last Cut Formula Phase 5, image security).
 *
 * Certxa serves every R2 object to anyone through GET /api/r2/<key> (and R2_PUBLIC_URL, when set), so an image that
 * must not be public can't be in R2 at all. So:
 *   - pending and rejected images live in a PRIVATE review folder on the server (HAIRSTYLE_REVIEW_DIR, default
 *     /var/lib/certxa/hairstyle-review, mode 700). Their key is "review/<uuid>.webp"; admins see them only through the
 *     authenticated preview route (GET /api/admin/hairstyles/images/:id/file).
 *   - approving PUBLISHES the file to R2 under a new key hairstyles/global/<slug>/<view>-<imageId>-<random>.webp
 *     (a fresh URL each time, so nothing cached from an earlier version is reused) and removes the private copy.
 *   - rejecting or replacing an approved image, or moving it to another view, UNPUBLISHES it: the file is copied back
 *     to the private folder, the database is updated, and then the R2 object is deleted.
 * The database keeps one key per image (hairstyle_template_images.r2_key); the "review/" prefix says it is private.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { deleteKeyFromR2, getObjectFromR2, putR2, toWebP } from "./r2";

export const REVIEW_PREFIX = "review/";
const REVIEW_KEY = /^review\/[0-9a-f-]{36}\.webp$/;
export const isReviewKey = (key: string) => key.startsWith(REVIEW_PREFIX);

export function reviewDir(): string {
  return process.env.HAIRSTYLE_REVIEW_DIR || "/var/lib/certxa/hairstyle-review";
}
function reviewPath(key: string): string {
  if (!REVIEW_KEY.test(key)) throw new Error("Not a review image key");
  return path.join(reviewDir(), key.slice(REVIEW_PREFIX.length));
}

/** Saves an uploaded image privately (converted to WebP) and returns its review key. */
export async function saveForReview(buffer: Buffer): Promise<string> {
  const { buffer: webp } = await toWebP(buffer, 88);
  await mkdir(reviewDir(), { recursive: true, mode: 0o700 });
  const key = `${REVIEW_PREFIX}${randomUUID()}.webp`;
  await writeFile(reviewPath(key), webp, { mode: 0o600 });
  return key;
}

export async function readReview(key: string): Promise<Buffer> {
  return readFile(reviewPath(key));
}

async function removeReview(key: string): Promise<void> {
  await rm(reviewPath(key), { force: true });
}

/** Approve: the private file goes to R2 under a fresh public key; returns the new key. The private copy is removed. */
export async function publish(reviewKey: string, slug: string, view: string, imageId: number): Promise<string> {
  const body = await readReview(reviewKey);
  const key = `hairstyles/global/${slug}/${view}-${imageId}-${randomBytes(4).toString("hex")}.webp`;
  await putR2(body, key, "image/webp");
  return key;
}
export async function afterPublish(reviewKey: string): Promise<void> {
  await removeReview(reviewKey).catch(() => {});
}

/**
 * Unapprove, step 1: copy the R2 object back into the private folder and return its review key. The caller points
 * the database at that key, commits, and only then deletes the R2 object (discardPublished), so a failure part-way
 * never leaves the database pointing at a deleted file.
 */
export async function copyToReview(publicKey: string): Promise<string> {
  if (isReviewKey(publicKey)) return publicKey;
  const obj = await getObjectFromR2(publicKey);
  const bytes = Buffer.from(await (obj.Body as any).transformToByteArray());
  await mkdir(reviewDir(), { recursive: true, mode: 0o700 });
  const key = `${REVIEW_PREFIX}${randomUUID()}.webp`;
  await writeFile(reviewPath(key), bytes, { mode: 0o600 });
  return key;
}

/** Removes a published file from R2 (after unapproving, or to undo a publish whose database update failed). */
export async function discardPublished(publicKey: string): Promise<void> {
  if (isReviewKey(publicKey)) return;
  try { await deleteKeyFromR2(publicKey); }
  catch (err) { console.error(`[hairstyle-images] could not delete ${publicKey} from R2 — remove it by hand:`, err); }
}

/** A new pending image: the file goes to the private folder, the row says pending (admin upload and scripts/upload-hairstyle-batch.ts). */
export async function addPendingImage(db: pg.Pool | pg.PoolClient, a: {
  templateId: number; view: string; buffer: Buffer; source: string; altText?: string | null; displayOrder?: number; metadata: Record<string, unknown>;
}) {
  const key = await saveForReview(a.buffer);
  return (await db.query(
    `INSERT INTO hairstyle_template_images (template_id, view, r2_key, source, approval_status, alt_text, display_order, metadata)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7) RETURNING *`,
    [a.templateId, a.view, key, a.source, a.altText ?? null, a.displayOrder ?? 0, JSON.stringify(a.metadata)])).rows[0];
}

