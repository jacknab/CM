/**
 * The Order Board theme's nail-category icons (owner, 2026-11-16): one glossy icon per kind of nail-salon category,
 * picked by the category's name (Kiosk_Nail_Category_Icons_ChatGPT.md lists them). They live in the booking app's
 * public/kiosk-art/nail-icons/<key>.webp (256 px). Trending and Best Deals only show for a salon that has a category by that
 * name; nothing is added to the menu.
 */

export type NailIconKey =
  | "manicure" | "pedicure" | "mani-pedi" | "acrylics" | "gel" | "gel-x" | "dip-powder" | "nail-art" | "waxing" | "lashes"
  | "brows" | "facial" | "spa" | "kids" | "add-ons" | "polish-change" | "trending" | "deals" | "all-inclusive" | "gift-card";


/** Most specific first: "Gel X" before "Gel", "Mani Pedi" before "Manicure", "Eyelash Extension" before "Extensions", "Nail Art" before any "nail". */
const RULES: Array<[RegExp, NailIconKey]> = [
  [/all[\s-]*inclusive|premium|luxury|deluxe/, "all-inclusive"],
  [/trend|popular|best[\s-]*sell/, "trending"],
  [/deal|special|promo/, "deals"],
  [/gift/, "gift-card"],
  [/\bkid|child|little/, "kids"],
  [/add[\s-]*on|extra|additional/, "add-ons"],
  [/polish\s*change|colou?r\s*change|^colou?rs?$/, "polish-change"],
  [/mani\w*\s*(&|and|\+|-)?\s*pedi|combo|package/, "mani-pedi"],
  [/lash/, "lashes"],
  [/brow|thread/, "brows"],
  [/gel[\s-]*x\b|extension|press[\s-]*on|\btips?\b/, "gel-x"],
  [/\bdip|\bsns\b|powder/, "dip-powder"],
  [/acrylic|enhancement/, "acrylics"],
  [/nail\s*art|design/, "nail-art"],
  [/\bgel/, "gel"],
  [/pedi|foot|feet/, "pedicure"],
  [/mani|nail/, "manicure"],
  [/wax/, "waxing"],
  [/facial|\bface\b|skin/, "facial"],
];

/** The icon for a category's name; "spa" (the lotus) for anything else. */
export function nailIconKey(categoryName: string): NailIconKey {
  const name = categoryName.toLowerCase();
  return RULES.find(([re]) => re.test(name))?.[1] ?? "spa";
}

/** The icon's address for a category's name. */
export const nailCategoryIconUrl = (categoryName: string): string => `/kiosk-art/nail-icons/${nailIconKey(categoryName)}.webp`;
