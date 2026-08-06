/**
 * run-service-image-auto-match.ts
 *
 * Cycles through all store accounts and auto-assigns service images from the
 * Service Images library, but only if the store has not been processed in the
 * last 30 days.
 *
 * Tracks per-store runs in:
 *   service_image_auto_match_runs(store_id, updated_on)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run run-service-image-auto-match
 *   pnpm --filter @workspace/scripts run run-service-image-auto-match -- --dry-run
 *   pnpm --filter @workspace/scripts run run-service-image-auto-match -- --storeId 123
 *   pnpm --filter @workspace/scripts run run-service-image-auto-match -- --overwrite
 *   pnpm --filter @workspace/scripts run run-service-image-auto-match -- --minScore 46
 */

import pg from "pg";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const DRY_RUN = hasFlag("--dry-run");
const OVERWRITE = hasFlag("--overwrite");
const STORE_ID = (() => {
  const raw = getArg("--storeId");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
})();
const MIN_SCORE = (() => {
  const raw = getArg("--minScore");
  if (!raw) return 46;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 46;
  return Math.max(1, Math.min(200, Math.round(parsed)));
})();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type StoreRow = {
  id: number;
};

type LastRunRow = {
  updated_on: string | Date;
};

type ServiceImageRow = {
  id: number;
  name: string;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  sort_order: number | null;
};

type ServiceRow = {
  id: number;
  name: string;
  category: string;
  image_url: string | null;
  custom_illustration_url?: string | null;
  illustration_category_id?: number | null;
};

type StorePrefsRow = {
  preferences: string | null;
};

type IllustrationCategoryRow = {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
};

type Industry = "NAIL_SALON" | "HAIR_SALON" | "BARBER_SHOP" | "SPA";

interface RuleSet {
  slug: string;
  keywords: string[];
  weight?: number;
}

const NAIL_SALON_RULES: RuleSet[] = [
  { slug: "acrylic-fill",      keywords: ["acrylic fill", "fill", "refill", "rebalance", "acrylic refill", "nail fill"] },
  { slug: "acrylic-full-set",  keywords: ["acrylic full set", "full set", "pink & white", "pink and white", "new set", "nail extension", "acrylic set", "powder full set"], weight: 2 },
  { slug: "dip-powder",        keywords: ["dip powder", "dip", "sns", "nexgen", "dipping powder"] },
  { slug: "gel-full-set",      keywords: ["gel full set", "builder gel", "gel overlay", "gel extension", "hard gel", "gel set"], weight: 2 },
  { slug: "classic-manicure",  keywords: ["manicure", "mani", "express mani", "regular mani", "classic mani", "regular nail", "nail service"] },
  { slug: "deluxe-manicure",   keywords: ["deluxe mani", "deluxe manicure", "luxury mani", "luxury manicure", "signature mani", "premium mani"], weight: 2 },
  { slug: "gel-manicure",      keywords: ["gel mani", "gel manicure", "shellac", "gel polish", "gel color", "no chip", "soak off"], weight: 2 },
  { slug: "hot-stone-manicure",keywords: ["hot stone mani", "hot stone manicure", "warm stone", "stone treatment mani"], weight: 3 },
  { slug: "pedicure",          keywords: ["pedicure", "pedi", "foot service", "toenail"] },
  { slug: "deluxe-pedicure",   keywords: ["deluxe pedi", "deluxe pedicure", "luxury pedi", "luxury pedicure", "signature pedi", "premium pedi"], weight: 2 },
  { slug: "spa-pedicure",      keywords: ["spa pedi", "spa pedicure", "paraffin pedi", "hot stone pedi", "milk honey", "organic pedi", "aromatherapy pedi"], weight: 2 },
  { slug: "nail-art",          keywords: ["nail art", "nail design", "chrome", "ombre nail", "glitter nail", "3d nail", "nail decoration", "encapsulated", "rhinestone"], weight: 2 },
  { slug: "french-tip",        keywords: ["french tip", "french manicure", "french pedicure", "american manicure", "french"], weight: 3 },
  { slug: "paraffin-treatment",keywords: ["paraffin", "wax treatment", "paraffin wax", "paraffin dip", "paraffin soak"], weight: 2 },
];

const HAIR_SALON_RULES: RuleSet[] = [
  { slug: "womens-haircut",      keywords: ["women's haircut", "womens haircut", "ladies haircut", "ladies cut", "women cut", "women's cut"], weight: 3 },
  { slug: "mens-haircut",        keywords: ["men's haircut", "mens haircut", "guys haircut", "men's cut", "boy haircut", "children haircut", "kids haircut"], weight: 3 },
  { slug: "haircut",             keywords: ["haircut", "hair cut", "trim", "cut and style", "cut & style", "dusting"] },
  { slug: "hair-color",          keywords: ["hair color", "hair colour", "single process", "all-over color", "root color", "full color", "tint", "coloring"], weight: 2 },
  { slug: "highlights",          keywords: ["highlights", "highlight", "partial highlight", "full highlight", "foil", "chunky highlight"], weight: 2 },
  { slug: "balayage",            keywords: ["balayage", "painting", "hand painted", "ombre", "sombre", "lived-in color", "color melt"], weight: 2 },
  { slug: "keratin-treatment",   keywords: ["keratin", "keratin treatment", "brazilian blowout", "smoothing treatment", "hair straightening"], weight: 2 },
  { slug: "hair-extensions",     keywords: ["extensions", "hair extensions", "weave", "weft", "tape in", "clip in", "fusion", "micro link", "bonded"], weight: 2 },
  { slug: "blowout",             keywords: ["blowout", "blow out", "blowdry", "blow dry", "blowout service"], weight: 2 },
  { slug: "wash-and-style",      keywords: ["wash and style", "shampoo and style", "wash style", "style only", "shampoo set"], weight: 2 },
];

const BARBER_RULES: RuleSet[] = [
  { slug: "beard-trim",          keywords: ["beard", "beard trim", "beard shaping", "beard grooming", "beard line", "beard up"], weight: 3 },
  { slug: "straight-razor-shave",keywords: ["straight razor", "razor shave", "clean shave", "traditional shave", "straight shave"], weight: 3 },
  { slug: "hot-towel-shave",     keywords: ["hot towel shave", "hot towel", "towel shave", "hot shave"], weight: 3 },
  { slug: "hair-and-beard-combo",keywords: ["hair and beard", "combo", "haircut and beard", "cut and beard", "haircut & beard"], weight: 2 },
  { slug: "barber-haircut",      keywords: ["haircut", "cut", "trim", "fade", "taper", "buzz cut", "skin fade", "bald fade"] },
];

const SPA_RULES: RuleSet[] = [
  { slug: "deep-cleansing-facial",keywords: ["deep cleansing", "deep pore", "purifying facial", "clarifying facial", "acne facial", "deep cleaning"], weight: 3 },
  { slug: "facial",              keywords: ["facial", "face treatment", "skin care", "skincare", "face mask", "face service"] },
  { slug: "hot-stone-massage",   keywords: ["hot stone massage", "stone massage", "hot stone therapy", "heated stone"], weight: 3 },
  { slug: "massage",             keywords: ["massage", "body massage", "relaxation massage", "swedish massage", "therapeutic massage", "deep tissue"] },
  { slug: "body-wrap",           keywords: ["body wrap", "wrap", "mud wrap", "seaweed wrap", "detox wrap", "bandage wrap"], weight: 2 },
  { slug: "body-scrub",          keywords: ["body scrub", "scrub", "exfoliation", "salt scrub", "sugar scrub", "body polish"], weight: 2 },
  { slug: "waxing",              keywords: ["wax", "waxing", "hair removal", "sugaring", "brazilian wax", "bikini wax", "leg wax", "brow wax"], weight: 2 },
  { slug: "eyebrow-service",     keywords: ["eyebrow", "brow", "eyebrow shaping", "brow tinting", "brow lamination", "lash", "eyelash", "lash lift", "lash extension"], weight: 2 },
];

const INDUSTRY_RULES: Record<Industry, RuleSet[]> = {
  NAIL_SALON: NAIL_SALON_RULES,
  HAIR_SALON: HAIR_SALON_RULES,
  BARBER_SHOP: BARBER_RULES,
  SPA: SPA_RULES,
};

function findIllustrationSlug(serviceName: string, industry: Industry = "NAIL_SALON"): string | null {
  const normalized = serviceName.toLowerCase().replace(/[^a-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();
  const rules = INDUSTRY_RULES[industry] ?? NAIL_SALON_RULES;

  let bestSlug: string | null = null;
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        const points = keyword.split(" ").length * (rule.weight ?? 1);
        score = Math.max(score, points);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSlug = rule.slug;
    }
  }

  return bestScore > 0 ? bestSlug : null;
}

function industryDefaultSlug(industry: Industry): string {
  const defaults: Record<Industry, string> = {
    NAIL_SALON: "classic-manicure",
    HAIR_SALON: "haircut",
    BARBER_SHOP: "barber-haircut",
    SPA: "massage",
  };
  return defaults[industry];
}

function nameMatchSlug(
  serviceName: string,
  cats: Array<{ slug: string; name: string }>,
): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const svc = norm(serviceName);

  for (const cat of cats) {
    if (norm(cat.name) === svc) return cat.slug;
  }
  for (const cat of cats) {
    const cn = norm(cat.name);
    if (svc.startsWith(cn) || svc.includes(cn)) return cat.slug;
  }
  for (const cat of cats) {
    const words = norm(cat.name).split(" ").filter((w) => w.length > 2);
    if (words.length >= 2 && words.every((w) => svc.includes(w))) return cat.slug;
  }

  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function overlapCount(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  let count = 0;
  for (const token of a) if (bSet.has(token)) count++;
  return count;
}

function scoreServiceToImage(service: ServiceRow, candidate: ServiceImageRow): number {
  const serviceName = normalizeText(service.name);
  const serviceCategory = normalizeText(service.category);
  const serviceSlug = slugify(service.name);
  const serviceTokens = tokens(service.name);

  const imageName = normalizeText(candidate.name);
  const imageCategory = normalizeText(candidate.category);
  const imageSubcategory = normalizeText(candidate.subcategory ?? "");
  const imageSlug = slugify(candidate.name);
  const imageTokens = tokens(candidate.name);

  let score = 0;

  if (serviceName && imageName && serviceName === imageName) score += 120;
  if (serviceSlug && imageSlug && serviceSlug === imageSlug) score += 100;

  if (serviceName && imageName) {
    if (serviceName.includes(imageName) || imageName.includes(serviceName)) score += 60;
    if (serviceName.startsWith(imageName) || imageName.startsWith(serviceName)) score += 20;
  }

  const overlap = overlapCount(serviceTokens, imageTokens);
  if (overlap > 0) {
    const union = new Set([...serviceTokens, ...imageTokens]).size;
    const minLen = Math.max(1, Math.min(serviceTokens.length, imageTokens.length));
    const jaccard = overlap / Math.max(1, union);
    const containment = overlap / minLen;
    score += Math.round(jaccard * 45 + containment * 35);
  }

  if (serviceCategory && imageCategory) {
    if (serviceCategory === imageCategory) score += 22;
    else if (serviceCategory.includes(imageCategory) || imageCategory.includes(serviceCategory)) score += 12;
    else {
      const catOverlap = overlapCount(tokens(serviceCategory), tokens(imageCategory));
      if (catOverlap > 0) score += 8;
    }
  }

  if (serviceName && imageSubcategory) {
    if (serviceName.includes(imageSubcategory) || imageSubcategory.includes(serviceName)) score += 10;
    else if (overlapCount(tokens(serviceName), tokens(imageSubcategory)) > 0) score += 6;
  }

  return score;
}

function pickBestServiceImage(
  service: ServiceRow,
  imagePool: ServiceImageRow[],
  minScore: number,
): { image: ServiceImageRow; score: number; matchType: "scored" | "closest_name_fallback" | "category_fallback" } | null {
  const scored = imagePool
    .map((image) => ({ image, score: scoreServiceToImage(service, image) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aOrder = a.image.sort_order ?? 0;
      const bOrder = b.image.sort_order ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.image.name.localeCompare(b.image.name);
    });

  const top = scored[0];
  if (top && top.score >= minScore) {
    return { image: top.image, score: top.score, matchType: "scored" };
  }

  if (top && top.score > 0) {
    return { image: top.image, score: top.score, matchType: "closest_name_fallback" };
  }

  const serviceCategory = normalizeText(service.category);
  if (serviceCategory) {
    const categoryFallback = imagePool
      .filter((img) => normalizeText(img.category) === serviceCategory)
      .sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      })[0];

    if (categoryFallback) {
      return { image: categoryFallback, score: top?.score ?? 0, matchType: "category_fallback" };
    }
  }

  return null;
}

async function shouldRunForStore(client: pg.PoolClient, storeId: number): Promise<boolean> {
  const lastRun = await client.query<LastRunRow>(
    `SELECT updated_on
     FROM service_image_auto_match_runs
     WHERE store_id = $1
     LIMIT 1`,
    [storeId],
  );

  if (!lastRun.rows[0]) return true;
  const last = new Date(lastRun.rows[0].updated_on).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= THIRTY_DAYS_MS;
}

async function markRun(client: pg.PoolClient, storeId: number): Promise<void> {
  await client.query(
    `INSERT INTO service_image_auto_match_runs (store_id, updated_on)
     VALUES ($1, NOW())
     ON CONFLICT (store_id)
     DO UPDATE SET updated_on = EXCLUDED.updated_on`,
    [storeId],
  );
}

async function processStore(client: pg.PoolClient, storeId: number): Promise<{
  updated: number;
  skippedExisting: number;
  skippedNoMatch: number;
  unchanged: number;
  kioskAssigned: number;
  kioskSkipped: number;
}> {
  const library = await client.query<ServiceImageRow>(
    `SELECT id, name, category, subcategory, image_url, sort_order
     FROM service_images
     WHERE is_active = true
     ORDER BY sort_order ASC, name ASC`,
  );

  const imagePool = library.rows.filter((row) => !!row.image_url?.trim());

  const svcRows = await client.query<ServiceRow>(
    `SELECT id, name, category, image_url
     FROM services
     WHERE store_id = $1
     ORDER BY name ASC`,
    [storeId],
  );

  let updated = 0;
  let skippedExisting = 0;
  let skippedNoMatch = 0;
  let unchanged = 0;

  for (const service of svcRows.rows) {
    if (!OVERWRITE && service.image_url) {
      skippedExisting++;
      continue;
    }

    const matched = imagePool.length ? pickBestServiceImage(service, imagePool, MIN_SCORE) : null;
    if (!matched || !matched.image.image_url) {
      skippedNoMatch++;
      continue;
    }

    if (service.image_url === matched.image.image_url) {
      unchanged++;
      continue;
    }

    if (!DRY_RUN) {
      await client.query(
        `UPDATE services SET image_url = $1 WHERE id = $2`,
        [matched.image.image_url, service.id],
      );
    }
    updated++;
  }

  // Kiosk illustration auto-match pass (same store cycle / same 30-day gate)
  const settingsRow = await client.query<StorePrefsRow>(
    `SELECT preferences
     FROM store_settings
     WHERE store_id = $1
     LIMIT 1`,
    [storeId],
  );

  let industry: Industry = "NAIL_SALON";
  try {
    const rawPrefs = settingsRow.rows[0]?.preferences;
    if (rawPrefs) {
      const parsed = JSON.parse(rawPrefs) as Record<string, unknown>;
      const kioskSettings = parsed.kioskSettings as Record<string, unknown> | undefined;
      const candidate = String(
        (kioskSettings?.industry as string | undefined)
        ?? (parsed.industry as string | undefined)
        ?? "NAIL_SALON",
      ).toUpperCase();
      if (candidate === "NAIL_SALON" || candidate === "HAIR_SALON" || candidate === "BARBER_SHOP" || candidate === "SPA") {
        industry = candidate;
      }
    }
  } catch {
    // keep default
  }

  const activeIllustrations = await client.query<IllustrationCategoryRow>(
    `SELECT id, slug, name, is_active
     FROM service_illustration_categories
     WHERE is_active = true`,
  );
  const illustrationBySlug = new Map<string, IllustrationCategoryRow>();
  for (const row of activeIllustrations.rows) {
    illustrationBySlug.set(row.slug, row);
  }

  const kioskServiceRows = await client.query<ServiceRow>(
    `SELECT id, name, custom_illustration_url, illustration_category_id
     FROM services
     WHERE store_id = $1
     ORDER BY name ASC`,
    [storeId],
  );

  const fallbackSlug = industryDefaultSlug(industry);
  let kioskAssigned = 0;
  let kioskSkipped = 0;

  for (const svc of kioskServiceRows.rows) {
    if (svc.custom_illustration_url || svc.illustration_category_id) {
      kioskSkipped++;
      continue;
    }

    const slug =
      findIllustrationSlug(svc.name, industry)
      ?? nameMatchSlug(svc.name, activeIllustrations.rows)
      ?? fallbackSlug;
    const cat = slug ? illustrationBySlug.get(slug) : undefined;
    if (!cat) {
      kioskSkipped++;
      continue;
    }

    if (!DRY_RUN) {
      await client.query(
        `UPDATE services
         SET illustration_category_id = $1,
             auto_assigned = true
         WHERE id = $2`,
        [cat.id, svc.id],
      );
    }
    kioskAssigned++;
  }

  return { updated, skippedExisting, skippedNoMatch, unchanged, kioskAssigned, kioskSkipped };
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log("Service image auto-match runner");
    console.log(`  dry-run   : ${DRY_RUN ? "yes" : "no"}`);
    console.log(`  overwrite : ${OVERWRITE ? "yes" : "no"}`);
    console.log(`  minScore  : ${MIN_SCORE}`);
    if (STORE_ID) console.log(`  storeId   : ${STORE_ID}`);

    const stores = await client.query<StoreRow>(
      STORE_ID
        ? `SELECT id FROM locations WHERE id = $1 ORDER BY id ASC`
        : `SELECT id FROM locations ORDER BY id ASC`,
      STORE_ID ? [STORE_ID] : [],
    );

    let processed = 0;
    let skippedRecent = 0;
    let totalUpdated = 0;
    let totalKioskAssigned = 0;

    for (const { id: storeId } of stores.rows) {
      const shouldRun = await shouldRunForStore(client, storeId);
      if (!shouldRun) {
        skippedRecent++;
        continue;
      }

      const result = await processStore(client, storeId);
      processed++;
      totalUpdated += result.updated;
      totalKioskAssigned += result.kioskAssigned;

      if (!DRY_RUN) {
        await markRun(client, storeId);
      }

      console.log(
        `store ${storeId}: svcUpdated=${result.updated}, svcSkippedExisting=${result.skippedExisting}, svcSkippedNoMatch=${result.skippedNoMatch}, svcUnchanged=${result.unchanged}, kioskAssigned=${result.kioskAssigned}, kioskSkipped=${result.kioskSkipped}`,
      );
    }

    console.log("Done");
    console.log(`  stores total     : ${stores.rows.length}`);
    console.log(`  stores processed : ${processed}`);
    console.log(`  stores skipped   : ${skippedRecent} (ran within 30 days)`);
    console.log(`  services updated : ${totalUpdated}`);
    console.log(`  kiosk assigned   : ${totalKioskAssigned}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[run-service-image-auto-match] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
