/**
 * Best-match lookup against the Service Images Library (`service_images`).
 *
 * Used to give kiosk pickers a real photo when the row being shown has no image
 * of its own (nail size / shape / effect vocab cards, etc). Pure token overlap
 * on name → subcategory → category, with a small bias from context words.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { serviceImages } from "@shared/schema";

const norm = (x: string) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const toks = (x: string) => new Set(norm(x).split(" ").filter((t) => t.length >= 2));

type PoolRow = { name: string; category: string | null; subcategory: string | null; imageUrl: string };
let poolCache: { at: number; rows: PoolRow[] } | null = null;
const POOL_TTL_MS = 60_000;

async function loadPool(): Promise<PoolRow[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL_MS) return poolCache.rows;
  const rows = await db
    .select({
      name: serviceImages.name,
      category: serviceImages.category,
      subcategory: serviceImages.subcategory,
      imageUrl: serviceImages.imageUrl,
    })
    .from(serviceImages)
    .where(and(
      eq(serviceImages.isActive, true),
      sql`${serviceImages.imageUrl} IS NOT NULL AND ${serviceImages.imageUrl} <> ''`,
    ))
    .orderBy(asc(serviceImages.sortOrder), asc(serviceImages.name));
  poolCache = { at: Date.now(), rows: rows as PoolRow[] };
  return poolCache.rows;
}

/**
 * For each term, return the best-matching library image URL (only when the
 * match is confident). `context` words (e.g. "nail", "shape") nudge the score
 * without being required. Keyed by the original term string.
 */
export async function matchLibraryImages(
  terms: (string | null | undefined)[],
  context: string[] = [],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(terms.filter((t): t is string => !!t && !!t.trim()))];
  if (!uniq.length) return out;

  const pool = await loadPool();
  if (!pool.length) return out;

  const ctxToks = new Set(context.flatMap((c) => [...toks(c)]));

  for (const term of uniq) {
    const tTokens = toks(term);
    if (!tTokens.size) continue;
    let best: string | undefined;
    let bestScore = 0;
    for (const img of pool) {
      const nameToks = toks(img.name);
      const subToks = toks(img.subcategory ?? "");
      const catToks = toks(img.category ?? "");
      let score = 0;
      for (const t of tTokens) {
        if (nameToks.has(t)) score += 4;
        else if (subToks.has(t)) score += 3;
        else if (catToks.has(t)) score += 2;
      }
      if (norm(img.name) === norm(term)) score += 8;      // exact name — decisive
      for (const c of ctxToks) if (nameToks.has(c) || subToks.has(c) || catToks.has(c)) score += 1;
      if (score > bestScore) { bestScore = score; best = img.imageUrl; }
    }
    if (best && bestScore >= 4) out.set(term, best);
  }
  return out;
}
