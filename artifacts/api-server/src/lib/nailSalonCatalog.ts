/**
 * nailSalonCatalog.ts
 *
 * Comprehensive static catalog for nail salon onboarding.
 * Every category includes realistic services (name, description, price, duration)
 * and a set of add-ons that can be attached to any service in that category.
 *
 * Category color keys map to the pastel system used in service_categories.color:
 *   lavender | periwinkle | peach | teal | lemon | sky | mint
 */

export type CatalogAddon = {
  name: string;
  description: string;
  price: string;
  duration: number; // minutes
  isStackable: boolean;
};

export type CatalogService = {
  name: string;
  description: string;
  price: string;
  duration: number; // minutes
  /** Keys into the shared add-on pool that apply to this service */
  addonKeys: string[];
};

export type CatalogCategory = {
  name: string;
  color: string; // pastel key
  sortOrder: number;
  services: CatalogService[];
};

// ── Shared add-on pool ────────────────────────────────────────────────────────
// Each add-on has a stable key used to reference it from service.addonKeys.

export const NAIL_ADDONS: Record<string, CatalogAddon> = {
  // ── Polish & finish ────────────────────────────────────────────────────────
  regular_polish: {
    name: "Regular Polish",
    description: "Classic nail polish in any color from our collection.",
    price: "0.00",
    duration: 5,
    isStackable: false,
  },
  gel_polish: {
    name: "Gel Polish Upgrade",
    description: "Long-lasting gel topcoat — chip-free for up to 3 weeks.",
    price: "10.00",
    duration: 10,
    isStackable: false,
  },
  french_tips: {
    name: "French Tips",
    description: "Classic white-tip French finish.",
    price: "10.00",
    duration: 10,
    isStackable: false,
  },
  ombre_fade: {
    name: "Ombré / Baby Boomer Fade",
    description: "Seamless gradient blending of two colors.",
    price: "15.00",
    duration: 15,
    isStackable: false,
  },
  matte_topcoat: {
    name: "Matte Topcoat",
    description: "Velvety matte finish over any color.",
    price: "5.00",
    duration: 5,
    isStackable: true,
  },

  // ── Nail art ───────────────────────────────────────────────────────────────
  nail_art_simple: {
    name: "Nail Art — Simple (per nail)",
    description: "Geometric lines, dots, or basic stamping on one nail.",
    price: "5.00",
    duration: 5,
    isStackable: true,
  },
  nail_art_detailed: {
    name: "Nail Art — Detailed (per nail)",
    description: "Florals, gradients, or hand-painted designs on one nail.",
    price: "10.00",
    duration: 10,
    isStackable: true,
  },
  nail_art_full_set: {
    name: "Full Set Nail Art",
    description: "Matching hand-painted design across all nails.",
    price: "30.00",
    duration: 30,
    isStackable: false,
  },
  chrome_powder: {
    name: "Chrome Powder",
    description: "Mirror-finish chrome pigment pressed over gel.",
    price: "10.00",
    duration: 10,
    isStackable: true,
  },
  glitter: {
    name: "Glitter",
    description: "Fine glitter mixed into gel or pressed on top for sparkle.",
    price: "5.00",
    duration: 5,
    isStackable: true,
  },
  rhinestones: {
    name: "Rhinestones",
    description: "Crystals and gems placed by design — up to 5 nails.",
    price: "10.00",
    duration: 10,
    isStackable: true,
  },
  foil_transfer: {
    name: "Foil Transfer",
    description: "Metallic or holographic foil applied over gel.",
    price: "8.00",
    duration: 8,
    isStackable: true,
  },

  // ── Treatments & repair ────────────────────────────────────────────────────
  cuticle_treatment: {
    name: "Cuticle Treatment",
    description: "Softening serum and detailed cuticle cleanup for healthier nails.",
    price: "8.00",
    duration: 10,
    isStackable: true,
  },
  nail_repair: {
    name: "Nail Repair (per nail)",
    description: "Silk or fiberglass wrap to repair a cracked or broken nail.",
    price: "5.00",
    duration: 10,
    isStackable: true,
  },
  paraffin_wax: {
    name: "Paraffin Wax Dip",
    description: "Warm paraffin treatment to deeply moisturize hands or feet.",
    price: "15.00",
    duration: 15,
    isStackable: true,
  },
  hot_stone_massage: {
    name: "Hot Stone Massage",
    description: "Heated basalt stones massaged into hands or lower legs for deep relaxation.",
    price: "15.00",
    duration: 15,
    isStackable: true,
  },
  callus_removal: {
    name: "Callus Removal",
    description: "Electric file and softening treatment to remove foot calluses.",
    price: "15.00",
    duration: 15,
    isStackable: true,
  },
  sugar_scrub: {
    name: "Sugar Scrub Exfoliation",
    description: "Nourishing sugar scrub exfoliates hands or feet before moisturizing.",
    price: "10.00",
    duration: 10,
    isStackable: true,
  },
  mask_wrap: {
    name: "Hydrating Mask & Wrap",
    description: "Rich moisturizing mask wrapped in warm towels for silky-smooth results.",
    price: "12.00",
    duration: 15,
    isStackable: true,
  },

  // ── Shape & length ─────────────────────────────────────────────────────────
  extra_length: {
    name: "Extra Length",
    description: "Extended nail tip beyond standard length.",
    price: "10.00",
    duration: 10,
    isStackable: false,
  },
  shape_change: {
    name: "Shape Change",
    description: "Custom shaping — almond, coffin, stiletto, square, oval, or squoval.",
    price: "5.00",
    duration: 5,
    isStackable: false,
  },

  // ── Removal ────────────────────────────────────────────────────────────────
  gel_removal: {
    name: "Gel Removal",
    description: "Safe soak-off removal of existing gel polish.",
    price: "10.00",
    duration: 15,
    isStackable: false,
  },
  acrylic_removal: {
    name: "Acrylic / Enhancement Removal",
    description: "Full soak-off removal of acrylics or hard gels.",
    price: "20.00",
    duration: 30,
    isStackable: false,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// NAIL CONFIGURATION TEMPLATE  (migration 0154)
//
// Store-owned vocabularies + the default per-service configuration applied to
// fake-nail services (extensions & fills where the client chooses length and
// shape). Every list is keyed by a stable `code`. The seeder resolves codes to
// the store's own rows. Prices here are starting points the owner tunes in the
// admin screen; they are stored as signed deltas vs the service's base price.
// ═════════════════════════════════════════════════════════════════════════════

export type NailVocabTemplate = {
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
};

export type NailArtApplicationTemplate = NailVocabTemplate & {
  /** true → priced at booking, not from config (e.g. "Custom Nail Art") */
  isQuote?: boolean;
};

/** A single service→vocab row in the template: which entry, and its adjustment. */
export type NailConfigEntry = {
  code: string;
  priceAdjustment: string;   // NUMERIC(10,2) as string, signed
  durationAdjustment?: number;
  isDefault?: boolean;
  enabled?: boolean;         // default true
};

export type NailServiceConfigTemplate = {
  lengthRequired?: boolean;  // default true
  shapeRequired?: boolean;   // default true
  artRequired?: boolean;     // default false
  sizes: NailConfigEntry[];
  shapes: NailConfigEntry[];
  artApplications: NailConfigEntry[];
  artEffects: NailConfigEntry[];
};

// ── Vocabularies ────────────────────────────────────────────────────────────

export const NAIL_SIZES: NailVocabTemplate[] = [
  { code: "short",  name: "Short",  sortOrder: 0 },
  { code: "medium", name: "Medium", sortOrder: 1 },
  { code: "long",   name: "Long",   sortOrder: 2 },
  { code: "xl",     name: "XL",     sortOrder: 3 },
  { code: "xxl",    name: "XXL",    sortOrder: 4 },
  { code: "xxxl",   name: "XXXL",   sortOrder: 5 },
];

export const NAIL_SHAPES: NailVocabTemplate[] = [
  { code: "square",        name: "Square",        sortOrder: 0 },
  { code: "squoval",       name: "Squoval",       sortOrder: 1 },
  { code: "round",         name: "Round",         sortOrder: 2 },
  { code: "oval",          name: "Oval",          sortOrder: 3 },
  { code: "almond",        name: "Almond",        sortOrder: 4 },
  { code: "coffin",        name: "Coffin",        sortOrder: 5 },
  { code: "ballerina",     name: "Ballerina",     sortOrder: 6 },
  { code: "stiletto",      name: "Stiletto",      sortOrder: 7 },
  { code: "lipstick",      name: "Lipstick",      sortOrder: 8 },
  { code: "flare",         name: "Flare",         sortOrder: 9 },
  { code: "mountain_peak", name: "Mountain Peak", sortOrder: 10 },
];

export const NAIL_ART_APPLICATIONS: NailArtApplicationTemplate[] = [
  { code: "accent_1", name: "Accent Nail",      description: "Design on one accent nail",  sortOrder: 0 },
  { code: "accent_2", name: "Two Accent Nails", description: "Design on two accent nails", sortOrder: 1 },
  { code: "full",     name: "Full Nail Art",    description: "Design on all ten nails",    sortOrder: 2 },
  { code: "custom",   name: "Custom Nail Art",  description: "Bespoke work, priced on consultation", isQuote: true, sortOrder: 3 },
];

export const NAIL_ART_EFFECTS: NailVocabTemplate[] = [
  { code: "french_tips",    name: "French Tips",         sortOrder: 0 },
  { code: "chrome",         name: "Chrome",              sortOrder: 1 },
  { code: "mirror_chrome",  name: "Mirror Chrome",       sortOrder: 2 },
  { code: "mermaid_chrome", name: "Mermaid Chrome",      sortOrder: 3 },
  { code: "holographic",    name: "Holographic",         sortOrder: 4 },
  { code: "unicorn",        name: "Unicorn",             sortOrder: 5 },
  { code: "aurora",         name: "Aurora",              sortOrder: 6 },
  { code: "cat_eye",        name: "Cat Eye",             sortOrder: 7 },
  { code: "velvet_cat_eye", name: "Velvet Cat Eye",      sortOrder: 8 },
  { code: "glazed_donut",   name: "Glazed Donut",        sortOrder: 9 },
  { code: "pearl",          name: "Pearl Finish",        sortOrder: 10 },
  { code: "mermaid_powder", name: "Mermaid Powder",      sortOrder: 11 },
  { code: "glitter",        name: "Glitter",             sortOrder: 12 },
  { code: "ombre",          name: "Ombré / Baby Boomer", sortOrder: 13 },
  { code: "marble",         name: "Marble",              sortOrder: 14 },
  { code: "magnetic",       name: "Magnetic",            sortOrder: 15 },
  { code: "foil",           name: "Foil",                sortOrder: 16 },
  { code: "rhinestones",    name: "Rhinestones",         sortOrder: 17 },
  { code: "3d_art",         name: "3D Art",              sortOrder: 18 },
  { code: "hand_painted",   name: "Hand Painted",        sortOrder: 19 },
  { code: "airbrush",       name: "Airbrush",            sortOrder: 20 },
  { code: "stamping",       name: "Stamping",            sortOrder: 21 },
];

// ── Default per-service configuration ───────────────────────────────────────

const SIZE_PRESET: NailConfigEntry[] = [
  { code: "short",  priceAdjustment: "0.00", isDefault: true },
  { code: "medium", priceAdjustment: "5.00" },
  { code: "long",   priceAdjustment: "10.00" },
  { code: "xl",     priceAdjustment: "15.00" },
  { code: "xxl",    priceAdjustment: "20.00" },
];

const SHAPE_PRESET: NailConfigEntry[] = [
  { code: "square",    priceAdjustment: "0.00", isDefault: true },
  { code: "squoval",   priceAdjustment: "0.00" },
  { code: "round",     priceAdjustment: "0.00" },
  { code: "oval",      priceAdjustment: "0.00" },
  { code: "almond",    priceAdjustment: "0.00" },
  { code: "coffin",    priceAdjustment: "5.00" },
  { code: "ballerina", priceAdjustment: "5.00" },
  { code: "stiletto",  priceAdjustment: "10.00" },
];

const ART_APPLICATION_PRESET: NailConfigEntry[] = [
  { code: "accent_1", priceAdjustment: "5.00" },
  { code: "accent_2", priceAdjustment: "10.00" },
  { code: "full",     priceAdjustment: "20.00" },
  { code: "custom",   priceAdjustment: "0.00" },   // is_quote — priced at booking
];

/** Premium techniques carry a surcharge; every other effect is offered at +$0. */
const ART_EFFECT_SURCHARGES: Record<string, string> = {
  velvet_cat_eye: "5.00",
  mermaid_chrome: "5.00",
  marble:         "8.00",
  airbrush:       "10.00",
  "3d_art":       "15.00",
  hand_painted:   "15.00",
};

function nailConfigPreset(
  overrides: Partial<Pick<NailServiceConfigTemplate, "lengthRequired" | "shapeRequired" | "artRequired">> = {},
  applications: NailConfigEntry[] = ART_APPLICATION_PRESET,
): NailServiceConfigTemplate {
  return {
    ...overrides,
    sizes:  SIZE_PRESET.map((s) => ({ ...s })),
    shapes: SHAPE_PRESET.map((s) => ({ ...s })),
    artApplications: applications.map((a) => ({ ...a })),
    artEffects: NAIL_ART_EFFECTS.map((e) => ({
      code: e.code,
      priceAdjustment: ART_EFFECT_SURCHARGES[e.code] ?? "0.00",
    })),
  };
}

/**
 * Default nail configuration by service name. A service listed here gets a
 * `nail_service_configs` row plus its four `service_nail_*` junction rows when
 * the catalog is seeded. Every other service in NAIL_CATALOG is left untouched.
 */
export const NAIL_SERVICE_CONFIG_DEFAULTS: Record<string, NailServiceConfigTemplate> = {
  "Full Set Acrylics":     nailConfigPreset(),
  "Acrylic Fill":          nailConfigPreset(),
  "Pink & White Full Set": nailConfigPreset(),
  "Pink & White Fill":     nailConfigPreset(),
  "Hard Gel Full Set":     nailConfigPreset(),
  "Hard Gel Fill":         nailConfigPreset(),
  "Dip Powder with Tips":  nailConfigPreset(),
  "Gel X Full Set":        nailConfigPreset(),
  "Gel X Fill":            nailConfigPreset(),
  // Art is the point of this service: it's required, and Full Nail Art is bundled.
  "Gel X with Nail Art":   nailConfigPreset({ artRequired: true }, [
    { code: "accent_1", priceAdjustment: "0.00" },
    { code: "accent_2", priceAdjustment: "0.00" },
    { code: "full",     priceAdjustment: "0.00" },
    { code: "custom",   priceAdjustment: "0.00" },
  ]),
};

// ── Category catalog ──────────────────────────────────────────────────────────

export const NAIL_CATALOG: CatalogCategory[] = [
  // ── 1. Manicures ──────────────────────────────────────────────────────────
  {
    name: "Manicures",
    color: "periwinkle",
    sortOrder: 0,
    services: [
      {
        name: "Basic Manicure",
        description: "Nail shaping, cuticle care, hand massage, and regular polish.",
        price: "25.00",
        duration: 30,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "glitter", "rhinestones", "cuticle_treatment", "paraffin_wax", "shape_change"],
      },
      {
        name: "Spa Manicure",
        description: "Everything in the basic manicure plus exfoliation, mask, and extended massage.",
        price: "40.00",
        duration: 50,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "glitter", "rhinestones", "paraffin_wax", "hot_stone_massage", "shape_change"],
      },
      {
        name: "Deluxe Manicure",
        description: "Premium experience with hot towels, paraffin dip, extended massage, and your choice of polish.",
        price: "55.00",
        duration: 65,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_full_set", "chrome_powder", "rhinestones", "shape_change"],
      },
      {
        name: "French Manicure",
        description: "Classic white-tip French finish with shaping, cuticle care, and hand massage.",
        price: "35.00",
        duration: 40,
        addonKeys: ["gel_polish", "matte_topcoat", "nail_art_simple", "rhinestones", "paraffin_wax", "shape_change"],
      },
      {
        name: "Mini Manicure",
        description: "Quick nail shape, light cuticle cleanup, and polish change — perfect for a refresh.",
        price: "18.00",
        duration: 20,
        addonKeys: ["gel_polish", "french_tips", "glitter", "shape_change"],
      },
    ],
  },

  // ── 2. Pedicures ──────────────────────────────────────────────────────────
  {
    name: "Pedicures",
    color: "teal",
    sortOrder: 1,
    services: [
      {
        name: "Basic Pedicure",
        description: "Foot soak, nail shaping, cuticle care, callus file, lower-leg massage, and regular polish.",
        price: "35.00",
        duration: 45,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "glitter", "callus_removal", "paraffin_wax", "shape_change"],
      },
      {
        name: "Spa Pedicure",
        description: "Basic pedicure enhanced with sugar scrub exfoliation, mask, and extended massage.",
        price: "55.00",
        duration: 65,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "rhinestones", "callus_removal", "paraffin_wax", "hot_stone_massage", "shape_change"],
      },
      {
        name: "Deluxe Pedicure",
        description: "Full treatment: milk soak, scrub, mask, paraffin dip, hot stone massage, and your choice of polish.",
        price: "75.00",
        duration: 85,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_full_set", "chrome_powder", "rhinestones", "shape_change"],
      },
      {
        name: "French Pedicure",
        description: "Classic white-tip French finish with full foot treatment and soak.",
        price: "45.00",
        duration: 55,
        addonKeys: ["gel_polish", "matte_topcoat", "callus_removal", "paraffin_wax", "shape_change"],
      },
      {
        name: "Gel Pedicure",
        description: "Pedicure with gel polish application for a long-lasting, chip-free finish.",
        price: "50.00",
        duration: 60,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "chrome_powder", "nail_art_simple", "rhinestones", "callus_removal", "paraffin_wax", "shape_change"],
      },
      {
        name: "Mini Pedicure",
        description: "Quick soak, nail shaping, light callus file, and polish change.",
        price: "28.00",
        duration: 30,
        addonKeys: ["gel_polish", "french_tips", "callus_removal", "shape_change"],
      },
    ],
  },

  // ── 3. Acrylic Nails ──────────────────────────────────────────────────────
  {
    name: "Acrylic Nails",
    color: "peach",
    sortOrder: 2,
    services: [
      {
        name: "Full Set Acrylics",
        description: "Complete set of acrylic nail tips with sculpting and regular polish finish.",
        price: "55.00",
        duration: 90,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "nail_art_full_set", "chrome_powder", "glitter", "rhinestones", "foil_transfer", "extra_length", "shape_change"],
      },
      {
        name: "Acrylic Fill",
        description: "Fill-in for grown-out acrylic set (up to 3 weeks growth). Includes reshape and polish.",
        price: "40.00",
        duration: 60,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "glitter", "rhinestones", "shape_change", "nail_repair"],
      },
      {
        name: "Pink & White Full Set",
        description: "Classic pink & white acrylic (permanent French) sculpted full set.",
        price: "70.00",
        duration: 100,
        addonKeys: ["matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "rhinestones", "extra_length", "shape_change"],
      },
      {
        name: "Pink & White Fill",
        description: "Fill-in for grown-out pink & white acrylic set.",
        price: "55.00",
        duration: 75,
        addonKeys: ["matte_topcoat", "nail_art_simple", "chrome_powder", "rhinestones", "shape_change", "nail_repair"],
      },
      {
        name: "Acrylic Removal",
        description: "Safe soak-off removal of acrylic enhancements with cuticle treatment.",
        price: "20.00",
        duration: 30,
        addonKeys: ["cuticle_treatment", "paraffin_wax"],
      },
      {
        name: "Acrylic Nail Repair",
        description: "Repair of a broken or lifted acrylic nail (per nail).",
        price: "8.00",
        duration: 15,
        addonKeys: ["gel_polish", "nail_art_simple"],
      },
    ],
  },

  // ── 4. Gel Nails ──────────────────────────────────────────────────────────
  {
    name: "Gel Nails",
    color: "lavender",
    sortOrder: 3,
    services: [
      {
        name: "Gel Manicure",
        description: "Gel polish applied over natural nails — long-lasting, chip-free color for up to 3 weeks.",
        price: "40.00",
        duration: 45,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "glitter", "rhinestones", "foil_transfer", "cuticle_treatment", "paraffin_wax", "shape_change"],
      },
      {
        name: "Hard Gel Full Set",
        description: "Builder gel sculpted over tips for strong, flexible enhancements with a natural look.",
        price: "65.00",
        duration: 90,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "nail_art_full_set", "chrome_powder", "glitter", "rhinestones", "extra_length", "shape_change"],
      },
      {
        name: "Hard Gel Fill",
        description: "Fill-in for grown-out hard gel set. Includes reshape and gel polish.",
        price: "50.00",
        duration: 65,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "chrome_powder", "glitter", "rhinestones", "shape_change", "nail_repair"],
      },
      {
        name: "Builder Gel Overlay",
        description: "Thin layer of builder gel over natural nails for added strength without length.",
        price: "45.00",
        duration: 55,
        addonKeys: ["gel_polish", "french_tips", "ombre_fade", "matte_topcoat", "chrome_powder", "nail_art_simple", "shape_change"],
      },
      {
        name: "Gel Polish Change",
        description: "Removal of existing gel and fresh gel color application.",
        price: "30.00",
        duration: 35,
        addonKeys: ["french_tips", "matte_topcoat", "chrome_powder", "glitter", "nail_art_simple", "shape_change"],
      },
      {
        name: "Gel Removal",
        description: "Safe soak-off removal of gel polish or hard gel with cuticle care.",
        price: "15.00",
        duration: 20,
        addonKeys: ["cuticle_treatment", "paraffin_wax", "regular_polish"],
      },
    ],
  },

  // ── 5. Dip Powder ─────────────────────────────────────────────────────────
  {
    name: "Dip Powder",
    color: "lemon",
    sortOrder: 4,
    services: [
      {
        name: "Dip Powder Manicure",
        description: "SNS/dip powder application over natural nails — no UV light needed, lasts 4–6 weeks.",
        price: "45.00",
        duration: 50,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "chrome_powder", "glitter", "rhinestones", "cuticle_treatment", "paraffin_wax", "shape_change"],
      },
      {
        name: "Dip Powder with Tips",
        description: "Dip powder applied over nail tips for added length and strength.",
        price: "60.00",
        duration: 70,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "chrome_powder", "glitter", "rhinestones", "extra_length", "shape_change"],
      },
      {
        name: "Dip Powder Fill",
        description: "Fill-in for grown-out dip powder set with fresh color.",
        price: "42.00",
        duration: 55,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "chrome_powder", "glitter", "shape_change", "nail_repair"],
      },
      {
        name: "Dip Powder Removal",
        description: "Safe soak-off removal of dip powder with cuticle treatment.",
        price: "15.00",
        duration: 20,
        addonKeys: ["cuticle_treatment", "paraffin_wax", "regular_polish"],
      },
      {
        name: "Ombré Dip",
        description: "Two-color gradient dip powder — seamlessly blended from base to tip.",
        price: "55.00",
        duration: 65,
        addonKeys: ["matte_topcoat", "chrome_powder", "glitter", "rhinestones", "shape_change"],
      },
    ],
  },

  // ── 6. Gel X ──────────────────────────────────────────────────────────────
  {
    name: "Gel X",
    color: "sky",
    sortOrder: 5,
    services: [
      {
        name: "Gel X Full Set",
        description: "Aprés Gel X soft gel full-cover tips applied with gel — lightweight, flexible, and natural-looking.",
        price: "65.00",
        duration: 90,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "nail_art_detailed", "nail_art_full_set", "chrome_powder", "glitter", "rhinestones", "foil_transfer", "extra_length", "shape_change"],
      },
      {
        name: "Gel X Fill",
        description: "Fill-in for grown-out Gel X set. Includes reshape and gel color.",
        price: "50.00",
        duration: 65,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "nail_art_simple", "chrome_powder", "glitter", "rhinestones", "shape_change", "nail_repair"],
      },
      {
        name: "Gel X Removal",
        description: "Safe gel soak-off removal of Gel X tips with cuticle care.",
        price: "20.00",
        duration: 25,
        addonKeys: ["cuticle_treatment", "paraffin_wax", "regular_polish"],
      },
      {
        name: "Gel X with Nail Art",
        description: "Full Gel X set with a custom hand-painted or stamped design on all nails.",
        price: "85.00",
        duration: 110,
        addonKeys: ["ombre_fade", "matte_topcoat", "chrome_powder", "glitter", "rhinestones", "foil_transfer", "extra_length", "shape_change"],
      },
      {
        name: "Gel X Color Change",
        description: "Removal of existing Gel X gel polish and fresh gel color application (tips kept).",
        price: "35.00",
        duration: 40,
        addonKeys: ["french_tips", "ombre_fade", "matte_topcoat", "chrome_powder", "nail_art_simple", "glitter", "shape_change"],
      },
    ],
  },

  // ── 7. Nail Art ───────────────────────────────────────────────────────────
  {
    name: "Nail Art",
    color: "mint",
    sortOrder: 6,
    services: [
      {
        name: "Nail Art Accent (2 nails)",
        description: "Hand-painted or stamped design on your choice of 2 accent nails.",
        price: "15.00",
        duration: 20,
        addonKeys: ["chrome_powder", "glitter", "rhinestones", "foil_transfer"],
      },
      {
        name: "Full Set Nail Art",
        description: "Matching hand-painted design across all 10 nails — florals, geometrics, abstract, and more.",
        price: "40.00",
        duration: 50,
        addonKeys: ["chrome_powder", "glitter", "rhinestones", "foil_transfer", "extra_length", "shape_change"],
      },
      {
        name: "3D Nail Art",
        description: "Dimensional acrylic or gel sculpting (flowers, gems, embossed patterns) — up to 5 nails.",
        price: "25.00",
        duration: 35,
        addonKeys: ["glitter", "rhinestones"],
      },
      {
        name: "Chrome & Foil Design",
        description: "Mirror-chrome or holographic foil nail art on all nails with gel topcoat.",
        price: "20.00",
        duration: 25,
        addonKeys: ["glitter", "rhinestones", "foil_transfer", "matte_topcoat"],
      },
      {
        name: "Nail Art Consultation",
        description: "Design consultation for custom nail art — includes a mood board and pricing quote.",
        price: "0.00",
        duration: 15,
        addonKeys: [],
      },
      {
        name: "Nail Stamping — Full Set",
        description: "Stamping plate designs applied to all nails for a precise, repeatable pattern.",
        price: "18.00",
        duration: 25,
        addonKeys: ["chrome_powder", "glitter", "rhinestones", "matte_topcoat"],
      },
    ],
  },
];

/** Return only the catalog entries for the selected category names. */
export function filterCatalog(selectedCategories: string[]): CatalogCategory[] {
  const set = new Set(selectedCategories.map(s => s.trim().toLowerCase()));
  return NAIL_CATALOG
    .filter(cat => set.has(cat.name.toLowerCase()))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
