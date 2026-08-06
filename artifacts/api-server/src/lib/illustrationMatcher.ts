/**
 * Illustration Matcher — keyword-scoring engine
 * Maps a service name to the best-fit illustration category slug.
 */

export type Industry = "NAIL_SALON" | "HAIR_SALON" | "BARBER_SHOP" | "SPA";

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
  NAIL_SALON:  NAIL_SALON_RULES,
  HAIR_SALON:  HAIR_SALON_RULES,
  BARBER_SHOP: BARBER_RULES,
  SPA:         SPA_RULES,
};

/**
 * Find the best illustration category slug for a given service name.
 * Returns null if no keyword scores above 0.
 */
export function findIllustrationSlug(serviceName: string, industry: Industry = "NAIL_SALON"): string | null {
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

/**
 * Return the default slug for an industry (used when nothing matches).
 */
export function industryDefaultSlug(industry: Industry): string {
  const defaults: Record<Industry, string> = {
    NAIL_SALON:  "classic-manicure",
    HAIR_SALON:  "haircut",
    BARBER_SHOP: "barber-haircut",
    SPA:         "massage",
  };
  return defaults[industry];
}
