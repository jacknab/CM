/**
 * Last Cut Formula editor — what can be picked, and the draft ↔ spec rules. Every section is optional: a barber picks
 * only what applies to this cut. Before saving, empty sections are dropped and the result is checked with the same
 * shared validation the server uses (checkSpecForSave), so the tablet never sends a spec the server would refuse.
 */
import { checkSpecForSave, SPEC_VERSION, type HaircutSpec, type SpecCheck } from "@shared/haircutFormula";

export const GUARDS = ["#0", "#0.5", "#1", "#1.5", "#2", "#2.5", "#3", "#4", "#5", "#6", "#7", "#8", "foil"] as const;
export const SIDE_TECHNIQUES = ["clipper-over-comb", "scissor-over-comb", "razor"] as const;
export const FADE_TYPES = ["none", "skin", "low", "mid", "high", "taper", "drop", "burst", "temple", "shadow"] as const;
export const HEIGHTS = ["low", "mid", "high"] as const;
export const TOP_LENGTHS = [0.5, 1, 1.5, 2, 2.5, 3, 4] as const;
export const TOP_TECHNIQUES = ["scissor", "clipper", "razor", "freehand"] as const;
export const TOP_TEXTURES = ["texturize", "thin", "point-cut"] as const;
export const DIRECTIONS = ["forward", "back", "up", "side-part-left", "side-part-right", "middle-part", "natural"] as const;
export const NECKLINES = ["natural", "squared", "rounded", "tapered", "faded-out"] as const;
export const SIDEBURN_LENGTHS = ["short", "mid", "long"] as const;
export const SIDEBURN_SHAPES = ["tapered", "natural", "squared"] as const;
export const BEARD_GUARDS = ["#0", "#0.5", "#1", "#1.5", "#2", "#2.5", "#3", "#4", "#5", "#6", "#7", "#8"] as const;
export const BEARD_SHAPES = ["stubble", "short-boxed", "full", "goatee", "chin-strap"] as const;

export type Draft = HaircutSpec;

/** Today's cut starting from a saved one: everything kept except where it came from (the Quick Note copy). */
export function draftFrom(spec: HaircutSpec | null | undefined): Draft {
  if (!spec) return { v: SPEC_VERSION };
  const { legacy: _legacy, ...rest } = structuredClone(spec) as HaircutSpec;
  return { ...rest, v: SPEC_VERSION };
}

/** Adds or removes a value in a list (multi-pick sections). */
export function toggle<T extends string>(list: readonly T[] | undefined, value: T): T[] {
  const now = list ?? [];
  return now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.values(v as object).every(isEmpty));

/** Drops empty sections and empty fields (deeply), so an untouched section never reaches the server. */
export function compactSpec(d: Draft): HaircutSpec {
  const walk = (o: any): any => {
    if (Array.isArray(o)) return o;
    if (!o || typeof o !== "object") return o;
    const out: any = {};
    for (const [k, v] of Object.entries(o)) {
      const w = walk(v);
      if (k === "v" || !isEmpty(w)) out[k] = w;
    }
    return out;
  };
  const spec = walk(d) as HaircutSpec;
  // A fade of "No fade" has no height.
  if (spec.fade?.type === "none") { delete spec.fade.height; delete spec.fade.start; delete spec.fade.end; }
  return { ...spec, v: SPEC_VERSION };
}

export function checkDraft(d: Draft): SpecCheck {
  return checkSpecForSave(compactSpec(d));
}

/** Same cut? (the Save button says "Saved" instead of sending it again) */
export function sameCut(a: HaircutSpec | null | undefined, b: HaircutSpec | null | undefined): boolean {
  const c = (x: unknown): unknown => Array.isArray(x) ? x.map(c) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, c((x as any)[k])])) : x;
  return JSON.stringify(c(a ? compactSpec(draftFrom(a)) : null)) === JSON.stringify(c(b ? compactSpec(draftFrom(b)) : null));
}
