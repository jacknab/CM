/**
 * A business's booking link: <slug>.certxa.com (also certxa.com/book/<slug>).
 *
 * One set of rules for sign-up, the Certxa Pro app, the website's Online Booking page and store updates:
 *  - 3-50 characters: lowercase letters, numbers and single hyphens, starting and ending with a letter or number;
 *  - not a word Certxa uses for its own addresses;
 *  - not another business's current link, an old link another business gave up, or a published website's name.
 *
 * Changing the link keeps the old one: it is recorded in booking_slug_history (migration 0255), keeps working
 * (it leads to the business's current page) and can never be taken by anyone else.
 */
import { pool } from "../db";

export const RESERVED_BOOKING_SLUGS = new Set([
  "www", "api", "admin", "app", "mail", "smtp", "ftp", "ns1", "ns2",
  "dev", "staging", "production", "support", "help", "blog", "status",
  "static", "assets", "cdn", "media", "img", "images",
  // Subdomains Certxa itself uses (middleware/subdomain.ts RESERVED_SUBDOMAINS).
  "certxa", "launchit", "shop", "store", "test", "demo", "secure", "manage", "rentals", "salons",
]);

const SLUG_FORMAT = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,48}[a-z0-9]$/;

/** "Toby's Nails!" → "tobys-nails". What a person typed, made into a link they can check. */
export function slugFromText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** Why a link can't be used by anyone, or null when its form is fine. */
export function slugFormatProblem(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 50) return "Use 50 characters or fewer.";
  if (!SLUG_FORMAT.test(slug)) return "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.";
  if (RESERVED_BOOKING_SLUGS.has(slug)) return "That word is reserved by Certxa.";
  return null;
}

/** The business an old (given-up) link belongs to. */
export async function storeIdForOldSlug(slug: string): Promise<number | null> {
  const row = await pool.query<{ store_id: number }>("SELECT store_id FROM booking_slug_history WHERE old_slug = $1", [slug]);
  return row.rows[0]?.store_id ?? null;
}

/** Is the link free for this business (storeId) - or for a new business when storeId is left out? */
export async function bookingSlugAvailable(slug: string, storeId?: number): Promise<boolean> {
  if (slugFormatProblem(slug)) return false;
  const [current, old, website] = await Promise.all([
    pool.query<{ id: number }>("SELECT id FROM locations WHERE booking_slug = $1 LIMIT 1", [slug]),
    pool.query<{ store_id: number }>("SELECT store_id FROM booking_slug_history WHERE old_slug = $1", [slug]),
    pool.query("SELECT 1 FROM wb_websites WHERE slug = $1 LIMIT 1", [slug]).catch(() => ({ rows: [] as unknown[] })),
  ]);
  if (current.rows[0] && current.rows[0].id !== storeId) return false;
  if (old.rows[0] && old.rows[0].store_id !== storeId) return false;
  return website.rows.length === 0;
}

/** A few free links close to what was asked for, for when it is taken. */
export async function suggestBookingSlugs(wanted: string, storeId?: number, extras: string[] = []): Promise<string[]> {
  const base = slugFromText(wanted).slice(0, 44) || "my-studio";
  const seeds = [...extras.map(slugFromText).filter(Boolean), `${base}-studio`, `${base}-beauty`, `book-${base}`, `${base}-${new Date().getFullYear() % 100}`];
  for (let n = 2; n <= 9; n += 1) seeds.push(`${base}-${n}`);
  const out: string[] = [];
  for (const seed of seeds) {
    if (out.length >= 3) break;
    if (seed !== wanted && !out.includes(seed) && await bookingSlugAvailable(seed, storeId)) out.push(seed);
  }
  return out;
}

/** Give the business a new link; its current one becomes an old link that leads to the new one. */
export async function changeBookingSlug(storeId: number, newSlug: string): Promise<{ slug: string; previous: string | null }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ booking_slug: string | null }>("SELECT booking_slug FROM locations WHERE id = $1 FOR UPDATE", [storeId]);
    const previous = current.rows[0]?.booking_slug ?? null;
    if (previous === newSlug) { await client.query("COMMIT"); return { slug: newSlug, previous }; }
    if (previous) {
      await client.query(
        `INSERT INTO booking_slug_history (old_slug, store_id) VALUES ($1, $2)
         ON CONFLICT (old_slug) DO UPDATE SET changed_at = now() WHERE booking_slug_history.store_id = EXCLUDED.store_id`,
        [previous, storeId]);
    }
    // Going back to one of its own old links makes it current again.
    await client.query("DELETE FROM booking_slug_history WHERE old_slug = $1 AND store_id = $2", [newSlug, storeId]);
    await client.query("UPDATE locations SET booking_slug = $1 WHERE id = $2", [newSlug, storeId]);
    await client.query("COMMIT");
    return { slug: newSlug, previous };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
