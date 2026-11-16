/**
 * Service workflows on the kiosk's Order Board (owner, 2026-11-16): after a client chooses a service, questions made
 * for that kind of service, then one upgrade offered with a line on what it does for them.
 *
 *   Acrylic, Gel X, hard gel, dip: length → shape → what's on the nails now → design → upgrade
 *   Manicure:                      what's on now → polish → design → add a pedicure? → upgrade
 *   Pedicure:                      what's on now → polish → add a manicure? → upgrade
 *   Mani-pedi:                     what's on now → polish → upgrade
 *   Waxing and anything else:      upgrade
 *
 * Length, shape and design come from the service's nail setup (Catalog › Nail Config) and are skipped without it.
 * Gel or acrylic already on puts the salon's matching removal add-on on the ticket (owner). Adding a pedicure to a
 * manicure (or the other way) switches the ticket to the salon's mani-pedi service when it has one (owner).
 * The upgrade is Certxa's pick from the salon's own add-ons unless the owner chose another (layout.serviceFlows).
 */

export type ServiceKind = "enhancement" | "manicure" | "pedicure" | "manipedi" | "waxing" | "other";
export const SERVICE_KINDS: Array<{ key: ServiceKind; name: string }> = [
  { key: "enhancement", name: "Acrylic, Gel X, hard gel & dip" },
  { key: "manicure", name: "Manicure" },
  { key: "pedicure", name: "Pedicure" },
  { key: "manipedi", name: "Mani-pedi" },
  { key: "waxing", name: "Waxing" },
  { key: "other", name: "Everything else" },
];

export type FlowStep = "length" | "shape" | "onNow" | "polish" | "design" | "crossSell" | "upgrade";
export const FLOW_STEPS: Record<ServiceKind, FlowStep[]> = {
  enhancement: ["length", "shape", "onNow", "design", "upgrade"],
  manicure: ["onNow", "polish", "design", "crossSell", "upgrade"],
  pedicure: ["onNow", "polish", "crossSell", "upgrade"],
  manipedi: ["onNow", "polish", "upgrade"],
  waxing: ["upgrade"],
  other: ["upgrade"],
};

/** What kind of service this is, from its name and category ("Gel X Full Set" in "Gel X": enhancement). */
export function serviceKind(name: string, category = ""): ServiceKind {
  const n = name.toLowerCase(), all = `${n} ${category.toLowerCase()}`;
  if (/mani\w*\s*(&|and|\+|-)?\s*pedi|combo/.test(all)) return "manipedi";
  if (/acrylic|gel[\s-]*x\b|hard\s*gel|builder\s*gel|\bdip|\bsns\b|pink\s*(&|and)\s*white|extension|enhancement|poly\s*gel/.test(all)) return "enhancement";
  if (/pedi|foot|feet|toe/.test(all)) return "pedicure";
  if (/mani|nail|polish/.test(all)) return "manicure";
  if (/wax/.test(all)) return "waxing";
  return "other";
}

/** A fill means the enhancement is already on and staying: no "what's on now" question, no removal. */
export const isFill = (name: string) => /\b(re)?fills?\b|\bfill[\s-]*in\b/i.test(name);

/** The salon's removal add-ons and its gel polish add-on, found by name. */
export const GEL_REMOVAL = /gel.*remov|remov.*gel|soak[\s-]*off/i;
export const ENHANCEMENT_REMOVAL = /(acrylic|enhancement|dip|sns|gel[\s-]*x|extension).*remov|remov.*(acrylic|enhancement|dip|sns|extension)/i;
export const GEL_POLISH = /gel\s*(polish|colou?r|upgrade|manicure\s*upgrade)|upgrade.*gel|shellac/i;

/** What's on the nails now. */
export type OnNow = "nothing" | "polish" | "gel" | "enhancement";

/** The families of upgrade Certxa knows how to talk about, by add-on name; each has its own line on the kiosk. */
export type UpgradeFamily = "chrome" | "french" | "rhinestones" | "nailArt" | "paraffin" | "cuticle" | "mask" | "hotStone" | "callus" | "scrub" | "massage" | "other";
const FAMILIES: Array<[RegExp, UpgradeFamily]> = [
  [/chrome|mirror|holo|aurora|cat[\s-]*eye/i, "chrome"],
  [/french|ombr|baby\s*boomer/i, "french"],
  [/rhinestone|crystal|\bgems?\b|jewel|charm/i, "rhinestones"],
  [/nail\s*art|design|foil/i, "nailArt"],
  [/paraffin/i, "paraffin"],
  [/cuticle/i, "cuticle"],
  [/mask|wrap|hydrat|collagen/i, "mask"],
  [/hot\s*stone/i, "hotStone"],
  [/callus/i, "callus"],
  [/scrub|exfoli|salt|sugar/i, "scrub"],
  [/massage/i, "massage"],
];
export const upgradeFamily = (addonName: string): UpgradeFamily => FAMILIES.find(([re]) => re.test(addonName))?.[1] ?? "other";

/** Certxa's choice of upgrade for each kind of service, best first; the first the salon has is offered. */
const DEFAULT_UPGRADES: Record<ServiceKind, UpgradeFamily[]> = {
  enhancement: ["chrome", "french", "rhinestones", "nailArt"],
  manicure: ["paraffin", "mask", "cuticle", "scrub"],
  pedicure: ["hotStone", "callus", "scrub", "mask", "paraffin"],
  manipedi: ["hotStone", "paraffin", "callus", "scrub"],
  waxing: [],
  other: [],
};

/** The owner's choice for one kind of service: an add-on (null: offer none) and their own words. */
export interface ServiceFlowSetting { upgradeAddonId: number | null; pitch: string }
export type ServiceFlowSettings = Partial<Record<ServiceKind, ServiceFlowSetting>>;
export const SERVICE_FLOW_PITCH_MAX = 160;

export function normalizeServiceFlows(raw: unknown): ServiceFlowSettings {
  const out: ServiceFlowSettings = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const { key } of SERVICE_KINDS) {
    const v = (raw as Record<string, unknown>)[key];
    if (!v || typeof v !== "object") continue;
    const id = (v as any).upgradeAddonId;
    out[key] = {
      upgradeAddonId: Number.isInteger(id) && id > 0 ? id : null,
      pitch: typeof (v as any).pitch === "string" ? (v as any).pitch.trim().slice(0, SERVICE_FLOW_PITCH_MAX) : "",
    };
  }
  return out;
}

interface AddonLike { id: number; name: string; price: number; serviceIds: number[]; kioskExtra?: boolean }

/** The add-ons a service can take on the kiosk (not Kiosk Extras; linked to it, or to every service). */
export const addonsForService = <A extends AddonLike>(addons: A[], serviceId: number) =>
  addons.filter((a) => !a.kioskExtra && (a.serviceIds.length === 0 || a.serviceIds.includes(serviceId)));

/**
 * The upgrade to offer: a returning client's usual add-on when this service takes it ("Add it again?", owner
 * 2026-11-16), else the owner's add-on for this kind of service, else Certxa's pick from the salon's add-ons (one that
 * costs something and isn't already chosen); null for none. The owner's "No offer" turns all of them off.
 */
export function pickUpgrade<A extends AddonLike>(kind: ServiceKind, addons: A[], serviceId: number, settings: ServiceFlowSettings, chosenIds: number[], usualIds: number[] = []): { addon: A; pitch: string; family: UpgradeFamily; usual: boolean } | null {
  const own = settings[kind];
  const pool = addons.filter((a) => !a.kioskExtra && !chosenIds.includes(a.id));
  if (own?.upgradeAddonId === null) return null;
  // Removals and gel polish have their own questions; they are never "the usual".
  const usualFits = (a: A) => a.price > 0 && !GEL_REMOVAL.test(a.name) && !ENHANCEMENT_REMOVAL.test(a.name) && !GEL_POLISH.test(a.name);
  const mineUsual = addonsForService(pool, serviceId).filter(usualFits);
  for (const id of usualIds) {
    const addon = mineUsual.find((a) => a.id === id);
    if (addon) return { addon, pitch: "", family: upgradeFamily(addon.name), usual: true };
  }
  if (own) {
    const addon = pool.find((a) => a.id === own.upgradeAddonId);
    return addon ? { addon, pitch: own.pitch, family: upgradeFamily(addon.name), usual: false } : null;
  }
  const mine = addonsForService(pool, serviceId).filter((a) => a.price > 0);
  for (const family of DEFAULT_UPGRADES[kind]) {
    const addon = mine.find((a) => upgradeFamily(a.name) === family);
    if (addon) return { addon, pitch: "", family, usual: false };
  }
  return null;
}
