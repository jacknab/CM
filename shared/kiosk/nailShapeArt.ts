/**
 * Nail shapes as add-ons (owner, 2026-11-16): the salon's "Shape: Almond" add-ons put the shape on the ticket, $0
 * when it's included, priced when it isn't. The Order Board's shape question shows them as cards with a picture of
 * the shape, from the booking app's public/kiosk-art/nail-shapes/<key>.webp (transparent, 384×512), picked by name.
 */

export type NailShapeArtKey = "square" | "round" | "oval" | "squoval" | "almond" | "coffin-ballerina" | "stiletto" | "oval-coffin";

/** An add-on that is a nail shape: "Shape: Almond". */
export const SHAPE_ADDON = /^\s*shape\s*:/i;

/** Most specific first: "Oval Coffin" before "Oval" and "Coffin", "Squoval" before "Square". */
const RULES: Array<[RegExp, NailShapeArtKey]> = [
  [/oval\s*coffin/, "oval-coffin"],
  [/squoval|squared?\s*oval/, "squoval"],
  [/coffin|ballerina/, "coffin-ballerina"],
  [/stiletto/, "stiletto"],
  [/almond/, "almond"],
  [/square/, "square"],
  [/oval/, "oval"],
  [/round/, "round"],
];
/** The cards' order: the included shapes first, as on the salon's chart. */
const ORDER: NailShapeArtKey[] = ["square", "round", "oval", "squoval", "almond", "coffin-ballerina", "stiletto", "oval-coffin"];

export const nailShapeArtKey = (name: string): NailShapeArtKey | null => RULES.find(([re]) => re.test(name.toLowerCase()))?.[1] ?? null;
export const nailShapeArtUrl = (name: string): string | null => {
  const key = nailShapeArtKey(name);
  return key ? `/kiosk-art/nail-shapes/${key}.webp` : null;
};

/** "Shape: Coffin (Ballerina)" → { title: "Coffin", note: "Ballerina" }. */
export function nailShapeLabel(addonName: string): { title: string; note: string | null } {
  const bare = addonName.replace(SHAPE_ADDON, "").trim();
  const m = bare.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { title: m[1], note: m[2] } : { title: bare, note: null };
}

/** Shape add-ons in the chart's order; shapes without a picture last. */
export const sortNailShapes = <A extends { name: string }>(addons: A[]): A[] => {
  const rank = (a: A) => { const k = nailShapeArtKey(a.name); return k ? ORDER.indexOf(k) : ORDER.length; };
  return [...addons].sort((x, y) => rank(x) - rank(y));
};
