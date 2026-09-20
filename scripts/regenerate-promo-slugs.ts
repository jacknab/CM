/**
 * One-off backfill: cleans up the ~336 nail_salons slugs that got mangled by
 * promotional text baked into the scraped `name` field (e.g. "World Nails At
 * Tustin (10% OFF New Customers)"). The original slug generator slugifies the
 * full name, then hard-truncates it to 36 chars with no word-boundary
 * trimming — with promo text inflating the name past that limit, the cut
 * lands mid-word, producing URLs like:
 *   world-nails-at-tustin-10-off-new-cu-north-tustin-street-orange-djtNZV
 *
 * This only touches rows whose name matches a promo-text heuristic (regex
 * below) — the other 47,000+ rows were sampled and found already
 * well-formed, so this deliberately does NOT regenerate every slug in the
 * table, only the genuinely malformed subset.
 *
 * The salon's `name` column itself is left untouched (still shows the promo
 * text on the live page) — only the derived slug changes. Renaming what a
 * business calls itself is a separate, more sensitive decision than fixing a
 * URL, and wasn't asked for here.
 *
 * Every changed slug is recorded in nail_salon_slug_redirects (old -> salon
 * id) BEFORE the row is updated, so a request for the old, possibly-already-
 * indexed slug 301s to the new one instead of 404ing (see
 * getSalonRedirectSlug() in lib/salonData.ts and its two call sites in
 * routes/salonApi.ts and marketplace/src/entry-server.tsx).
 *
 * Run:
 *   cd artifacts/api-server && set -a; . /etc/certxa.env; set +a; \
 *     pnpm tsx ../../scripts/regenerate-promo-slugs.ts [--write] [--limit=N]
 *
 *   (default)   Dry run — prints old -> new slug for every affected row, writes nothing.
 *   --write     Actually apply: insert redirect row + UPDATE nail_salons.slug.
 *   --limit=N   Only process the first N matching rows (for testing).
 */

import { Pool } from "pg";
import { splitAddress } from "../artifacts/api-server/src/lib/salonData";

const WRITE = process.argv.includes("--write");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Same broad net used to find candidates, re-checked per-row below by
// cleanName() actually changing something (a few names matched this net but
// have no real promo text — e.g. a stray "discount"-adjacent word — and are
// skipped as no-ops).
const PROMO_CANDIDATE_RE = /\d+% *off|\(.*off.*\)|new customer|free.*service|discount/i;

// Earliest point any of these start marks where promotional text begins;
// everything from there on is dropped from the name used for slugging.
const TRIGGERS: RegExp[] = [
  /\(/,
  /\d+\s*%/,
  /\bnew\s+customer/i,
  /\bnew\s+client/i,
  /\bunder\s+new\s+management\b/i,
  /\bnew\s+management\b/i,
  /\bfor\s+students\b/i,
  /\bfor\s+(?:new\s+)?(?:clients|customers)\b/i,
  /\bfirst\s+visit\b/i,
  /\bspecials?\s+for\b/i,
  /\bdiscount/i,
  /\boff\s+(?:for|nails?|pedicures?|your|any|all)\b/i,
  /-\s*\d+%/,
  /\bget\b(?=[\s\S]{0,20}\d+\s*%)/i,
  /\benjoy\b(?=[\s\S]{0,20}\d+\s*%)/i,
];

function cleanName(name: string): string {
  let best = -1;
  for (const re of TRIGGERS) {
    const m = name.match(re);
    if (m && m.index !== undefined && (best === -1 || m.index < best)) best = m.index;
  }
  if (best <= 0) return name.trim();
  const cleaned = name.slice(0, best).replace(/[\s\-–—*|,:]+$/g, "").trim();
  return cleaned || name.trim(); // never return empty
}

// Matches the expansions visible in the existing 47k well-formed slugs
// (e.g. "441 Clark Ave W" -> "clark-avenue-west") — kept close to that style
// so these ~332 don't look stylistically out of place next to the rest.
const STREET_TYPE_EXPANSIONS: Record<string, string> = {
  ave: "avenue", blvd: "boulevard", rd: "road", dr: "drive", ln: "lane",
  ct: "court", pl: "place", pkwy: "parkway", hwy: "highway", st: "street",
  ste: "suite", n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

function slugifyStreet(street: string): string {
  const tokens = street
    .replace(/^\s*\d+\S*\s+/, "") // drop a leading house number (e.g. "5745 ", "441 ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens
    .map((t) => {
      const bare = t.replace(/[.,#]/g, "").toLowerCase();
      return STREET_TYPE_EXPANSIONS[bare] || bare;
    })
    .join("-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomSuffix(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  return out;
}

async function slugExists(slug: string): Promise<boolean> {
  const res = await pool.query("SELECT 1 FROM nail_salons WHERE slug = $1", [slug]);
  return (res.rowCount ?? 0) > 0;
}

async function main() {
  const res = await pool.query<{ id: number; name: string; address: string | null; slug: string }>(
    `SELECT id, name, address, slug FROM nail_salons WHERE name ~* $1 ORDER BY id`,
    [PROMO_CANDIDATE_RE.source]
  );
  const rows = LIMIT > 0 ? res.rows.slice(0, LIMIT) : res.rows;

  let changed = 0, skipped = 0, collisionRetries = 0;

  for (const row of rows) {
    const cleaned = cleanName(row.name);
    if (cleaned === row.name.trim()) { skipped++; continue; }

    const { street, city } = splitAddress(row.address || "");
    const parts = [slugify(cleaned)];
    if (street) parts.push(slugifyStreet(street));
    if (city) parts.push(slugify(city));
    const base = parts.filter(Boolean).join("-");

    let newSlug = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${base}-${randomSuffix()}`;
      if (candidate === row.slug) continue; // never happens in practice, but skip a no-op collision
      if (!(await slugExists(candidate))) { newSlug = candidate; break; }
      collisionRetries++;
    }
    if (!newSlug) {
      console.error(`[skip] id=${row.id} could not find a unique slug after 5 attempts`);
      continue;
    }

    changed++;
    console.log(`${row.id}\t${row.slug}\n\t-> ${newSlug}`);

    if (WRITE) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO nail_salon_slug_redirects (old_slug, salon_id) VALUES ($1, $2)
           ON CONFLICT (old_slug) DO NOTHING`,
          [row.slug, row.id]
        );
        await client.query(`UPDATE nail_salons SET slug = $1 WHERE id = $2`, [newSlug, row.id]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  }

  console.log(`\n${WRITE ? "Applied" : "Would change"}: ${changed}, skipped (no promo text found): ${skipped}, collision retries: ${collisionRetries}`);
  if (!WRITE) console.log("Dry run only — re-run with --write to apply.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
