/**
 * Fixed service-category templates, keyed by business type.
 *
 * These give the AI menu importer (routes/serviceImport.ts) a closed set of
 * categories to work within for a given business type — the AI is told about
 * the business type during onboarding (the very first step), so by the time
 * it builds the catalog it should never be inventing category names on the
 * fly. It should only ever place a service into one of the categories below,
 * using the `patterns` for fast deterministic matches and `guidance` as
 * context for the AI classification prompts.
 *
 * `businessType` must exactly match the string stored in `locations.category`
 * (see the onboarding business-type step — values are Title Case, e.g.
 * "Nail Salon", not "nail_salon").
 *
 * A business type with no entry here simply falls back to the existing
 * dynamic (AI-suggested) category behavior — nothing breaks for business
 * types not yet covered.
 */

export interface FixedCategoryDef {
  /** Canonical display name — this becomes the service_categories.name row. */
  name: string;
  /** 1-based order used for service_categories.sort_order when first created. */
  sortOrder: number;
  /** Short description of what belongs here, used as AI prompt context. */
  guidance: string;
  /** Fast deterministic (Tier 0) match patterns — checked before any AI call. */
  patterns: RegExp[];
}

export interface FixedCategoryTemplate {
  businessType: string;
  categories: FixedCategoryDef[];
}

const NAIL_SALON_TEMPLATE: FixedCategoryTemplate = {
  businessType: "Nail Salon",
  categories: [
    {
      name: "Manicures",
      sortOrder: 1,
      guidance:
        "Standard manicures and basic nail maintenance: classic/basic/gel manicures, polish changes, and basic nail repairs. Enhancement/extension-specific repairs (acrylic repair, Gel-X repair, builder gel repair, extension repair) go under Enhancements instead — those already match on their service-type keyword (acrylic, Gel-X, etc.), not on the word \"repair\".",
      patterns: [
        /\bmanis?\b/i,
        /\bmanicures?\b/i,
        /\bpolish change\b/i,
        /\bfrench manicure\b/i,
        /\bnail repairs?\b/i,
      ],
    },
    {
      name: "Pedicures",
      sortOrder: 2,
      guidance:
        "All pedicure services: basic/classic/spa/gel/deluxe/express pedicures, pedicure with polish or gel polish, callus treatments, sea-salt scrubs, cooling masks, toe-nail services.",
      patterns: [
        /\bpedis?\b/i,
        /\bpedicures?\b/i,
        /\bcallus\b/i,
        /\bsea[\s-]?salt\b/i,
        /\bcooling mask\b/i,
        /\btoe[\s-]?nails?\b/i,
      ],
    },
    {
      name: "Enhancements",
      sortOrder: 3,
      guidance:
        "Artificial nail / enhancement / extension / overlay services: acrylic, Gel-X, builder gel, hard gel, dip powder, extensions, full sets, fills/refills, overlays, soak-offs/removals, new-set fees, shellac/Gelish/gel polish, Polygel, and enhancement-specific repairs (acrylic repair, Gel-X repair, builder gel repair, extension repair).",
      patterns: [
        /\bacrylics?\b/i,
        /\bgel[\s-]?x\b/i,
        /\bbuilder gel\b/i,
        /\bhard gel\b/i,
        /\bdip(?:ping)?\s*powder\b/i,
        /\bsns\b/i,
        /\bextensions?\b/i,
        /\bfull sets?\b/i,
        /\bfills?\b/i,
        /\brefills?\b/i,
        /\boverlays?\b/i,
        /\bsoak[\s-]?off\b/i,
        /\bremoval\b/i,
        /\bnew set\b/i,
        /\bshellac\b/i,
        /\bgelish\b/i,
        /\bgel polish\b/i,
        /\bpolygel\b/i,
        /\bnail extensions?\b/i,
      ],
    },
    {
      name: "Nail Art",
      sortOrder: 4,
      guidance:
        "Decorative/artistic nail services: nail art, custom designs, French tips, chrome, ombre, airbrush, hand-painted designs, 3D nail art, rhinestones, nail charms.",
      patterns: [
        /\bnail art\b/i,
        /\bhand design\b/i,
        /\bnail design\b/i,
        /\bcharms?\b/i,
        /\bfrench tips?\b/i,
        /\bchrome\b/i,
        /\bombre\b/i,
        /\bairbrush\b/i,
        /\brhinestones?\b/i,
        /\b3d\b/i,
        /\bdesigns?\b/i,
      ],
    },
    {
      name: "Waxing",
      sortOrder: 5,
      guidance:
        "Waxing services for any body area: eyebrow, upper lip, chin, full face, bikini, leg, arm, underarm wax.",
      patterns: [/\bwax(?:ing)?\b/i],
    },
    {
      name: "Threading",
      sortOrder: 6,
      guidance:
        "Threading services for any body area: eyebrow, upper lip, chin, full face threading.",
      patterns: [/\bthread(?:ing)?\b/i],
    },
    {
      name: "Combos",
      sortOrder: 7,
      guidance:
        "ONLY for services that bundle two or more services sold together as a single offering, e.g. Manicure + Pedicure, Full Set + Pedicure, Manicure + Eyebrow Wax. Never used for a single service type.",
      patterns: [/\bcombos?\b/i, /\bcombinations?\b/i],
    },
  ],
};

/**
 * All fixed templates, keyed by the exact `locations.category` string.
 * Add more business types here as they get a defined template — anything
 * not listed falls back to the existing dynamic category behavior.
 */
export const FIXED_CATEGORY_TEMPLATES: Record<string, FixedCategoryTemplate> = {
  "Nail Salon": NAIL_SALON_TEMPLATE,
};

export function getFixedCategoryTemplate(businessType: string | null | undefined): FixedCategoryTemplate | null {
  if (!businessType) return null;
  return FIXED_CATEGORY_TEMPLATES[businessType] ?? null;
}

/** Category names in display order for this template. */
export function getFixedCategoryNames(template: FixedCategoryTemplate): string[] {
  return [...template.categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.name);
}

export function getFixedCategorySortOrder(template: FixedCategoryTemplate, name: string): number {
  return template.categories.find((c) => c.name === name)?.sortOrder ?? 999;
}

/**
 * Renders a block of text describing the fixed categories for injection into
 * an AI prompt (menu extraction and/or classification) — makes the fixed list
 * the explicit source of truth the model is told to follow.
 */
export function renderFixedCategoryPromptBlock(template: FixedCategoryTemplate): string {
  const ordered = [...template.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines = ordered.map((c, i) => `${i + 1}. ${c.name} — ${c.guidance}`);
  return [
    `This is a ${template.businessType}. You MUST use ONLY these ${ordered.length} categories — never invent, rename, split, or add any other category, and never turn a service type, technique, brand, material, body area, or price tier into its own category:`,
    ...lines,
    `Always map every service into the single closest category above, even if the fit isn't perfect.`,
  ].join("\n");
}

/**
 * Tier-0 deterministic match: checks a service name against the template's
 * regex patterns. Returns null if nothing matches (the caller should then
 * fall through to AI/fuzzy matching against the fixed category list — never
 * to category invention).
 *
 * Combo detection runs first and takes priority over every other pattern:
 * a "+" joining two service names ("Manicure + Pedicure", "Full Set +
 * Pedicure", "Manicure + Eyebrow Wax") is the clearest signal a menu uses for
 * a bundled offering, and a manicure+pedicure combo is always Combos even
 * without a "+" (e.g. "Mani Pedi", "Manicure and Pedicure").
 */
export function matchFixedCategoryByPattern(template: FixedCategoryTemplate, serviceName: string): string | null {
  const combos = template.categories.find((c) => c.name === "Combos");
  if (combos && /\+/.test(serviceName)) return combos.name;

  const hasManicure = /\b(?:manis?|manicures?)\b/i.test(serviceName);
  const hasPedicure = /\b(?:pedis?|pedicures?)\b/i.test(serviceName);
  if (combos && hasManicure && hasPedicure) return combos.name;

  for (const cat of template.categories) {
    if (cat.patterns.some((p) => p.test(serviceName))) return cat.name;
  }
  return null;
}
