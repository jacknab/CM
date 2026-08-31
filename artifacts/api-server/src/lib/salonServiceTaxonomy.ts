/**
 * Shared vocabulary for turning price-list rows into real services or add-ons.
 *
 * This is intentionally deterministic and business-type aware. The model is
 * still responsible for reading the menu, but these rules prevent common
 * add-on rows from becoming fake service categories or standalone bookings.
 */

export type SalonBusinessType = "nail" | "hair" | "spa" | "tattoo" | "piercing" | "general";

export interface TaxonomyMatch {
  isAddon: boolean;
  addonCategory: string;
  normalizedName: string;
}

const ADDON_RULES: Record<SalonBusinessType, RegExp[]> = {
  nail: [
    /\bpolish\s*(?:change|refresh)|polish\s*change\b/i,
    /\b(?:rhinestone|rhinestones|rhinstone|rhinstones|gem|gems|charm|charms)\b/i,
    /\b(?:hot\s*towel|extra\s*massage|nail\s*whitener|nail\s*whitening)\b/i,
    /\b(?:cuticle\s*oil|paraffin|scrub|mask|callus\s*treatment|design\s*add[- ]?on)\b/i,
  ],
  hair: [
    /\b(?:toner|glaze|olaplex|bond\s*builder|deep\s*condition|scalp\s*massage)\b/i,
    /\b(?:extra\s*color|additional\s*color|length\s* surcharge|thick\s*hair)\b/i,
    /\b(?:blowout|blow\s*dry)\s*add[- ]?on\b/i,
  ],
  spa: [
    /\b(?:hot\s*stone|aromatherapy|cupping|paraffin|foot\s*scrub|scalp\s*massage)\b/i,
    /\b(?:eye|lip|hand|foot|neck|shoulder)\s*(?:treatment|massage|mask)\b/i,
    /\badd[- ]?on\b/i,
  ],
  tattoo: [
    /\b(?:color|shading|detail|cover[- ]?up|touch[- ]?up|aftercare)\s*add[- ]?on\b/i,
    /\b(?:extra\s*detail|custom\s*design|aftercare\s*kit)\b/i,
  ],
  piercing: [
    /\b(?:jewelry|jewellery|upgrade|downsize|aftercare|saline|gem)\b/i,
    /\b(?:additional|extra)\s*(?:piercing|jewelry)\b/i,
  ],
  general: [/\badd[- ]?on\b/i, /\bextra\b/i, /\bupgrade\b/i],
};

const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:polish\s*change|rhinestone|rhinstone|gem|charm|hot\s*towel|extra\s*massage|nail\s*whitener)\b/i, "Nail Add-ons"],
  [/\b(?:toner|glaze|olaplex|bond\s*builder)\b/i, "Hair Add-ons"],
  [/\b(?:aromatherapy|hot\s*stone|cupping|paraffin)\b/i, "Spa Add-ons"],
  [/\b(?:jewelry|jewellery|saline|aftercare)\b/i, "Piercing Add-ons"],
];

function titleCase(input: string): string {
  return input.replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize obvious OCR/spelling variants without changing the owner's wording. */
export function normalizeImportedItemName(name: string): string {
  return name
    .replace(/\brhinstones?\b/gi, "Rhinestone")
    .replace(/\bpolish\s*change\b/gi, "Polish Change")
    .replace(/\bhot\s*towels?\b/gi, "Hot Towel")
    .replace(/\bnail\s*whitener\b/gi, "Nail Whitener")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSalonBusinessType(category: string | null | undefined): SalonBusinessType {
  const value = String(category ?? "").toLowerCase();
  if (/nail/.test(value)) return "nail";
  if (/hair|barber|beauty salon/.test(value)) return "hair";
  if (/spa|massage|esthetic|facial/.test(value)) return "spa";
  if (/tattoo/.test(value)) return "tattoo";
  if (/pierc/.test(value)) return "piercing";
  return "general";
}

export function classifyImportedItem(name: string, businessType: SalonBusinessType): TaxonomyMatch {
  const normalizedName = normalizeImportedItemName(name);
  const rule = ADDON_RULES[businessType].find((candidate) => candidate.test(normalizedName))
    ?? ADDON_RULES.general.find((candidate) => candidate.test(normalizedName));
  const category = CATEGORY_ALIASES.find(([candidate]) => candidate.test(normalizedName))?.[1]
    ?? `${titleCase(businessType)} Add-ons`;

  return { isAddon: Boolean(rule), addonCategory: category, normalizedName };
}
