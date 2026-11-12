/**
 * Last Cut Formula — a saved spec (shared/haircutFormula.ts, v1) as the rows a barber reads on the tablet:
 * Hairstyle, Sides, Fade, Top, Neckline, Sideburns, Beard, Hairline, Notes. Rows with nothing in them are left out,
 * so a scissor cut shows no fade and a cut without a beard shows no beard.
 */
import type { HaircutSpec } from "@shared/haircutFormula";

export type FormulaRow = { key: string; label: string; tags: string[]; text?: string };

const WORDS: Record<string, string> = {
  none: "No fade", skin: "Skin", low: "Low", mid: "Mid", high: "High", taper: "Taper", drop: "Drop", burst: "Burst", temple: "Temple", shadow: "Shadow",
  "faded-out": "Faded out", "clipper-over-comb": "Clipper over comb", "scissor-over-comb": "Scissor over comb", "shear-over-comb": "Shear over comb",
  "point-cut": "Point cut", "side-part-left": "Side part left", "side-part-right": "Side part right", "middle-part": "Middle part",
  "recessed-follow": "Follow the recession", "visible-line": "Visible line", disconnected: "Disconnected", seamless: "Seamless blend",
  foil: "Foil", texturize: "Texturize", thin: "Thin", freehand: "Freehand", forward: "Forward", back: "Back", up: "Up",
};
export const word = (v: string): string => WORDS[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, " ");
const len = (l?: { value: number; unit: string }) => (!l ? null : l.unit === "in" ? `${l.value} in` : l.unit === "mm" ? `${l.value} mm` : `#${l.value}`);
const fadeName = (type?: string) => (!type ? null : type === "none" ? "No fade" : ["low", "mid", "high"].includes(type) ? `${word(type)} fade` : `${word(type)} fade`);

export function formulaRows(spec: HaircutSpec | null | undefined, extra: { hairstyleName?: string | null; notes?: string | null } = {}): FormulaRow[] {
  if (!spec) return [];
  const rows: FormulaRow[] = [];
  const add = (key: string, label: string, tags: (string | null | undefined | false)[], text?: string | null) => {
    const t = tags.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (t.length || text) rows.push({ key, label, tags: t, ...(text ? { text } : {}) });
  };
  const s = spec;
  add("style", "Hairstyle", [extra.hairstyleName ?? s.style?.name ?? null]);
  const sideGuards = s.sides?.left || s.sides?.right
    ? [s.sides?.left && `Left ${s.sides.left.guard.join(" / ")}`, s.sides?.right && `Right ${s.sides.right.guard.join(" / ")}`]
    : [];
  add("sides", "Sides", [...(s.sides?.guard ?? []).map((g) => (g === "foil" ? "Foil" : g)), ...sideGuards, len(s.sides?.length), ...(s.sides?.technique ?? []).map(word), ...(s.methods ?? []).map(word)]);
  const f = s.fade;
  const fadeTags = f ? [
    fadeName(f.type), f.type !== "none" && f.height && f.height !== f.type ? `${word(f.height)} height` : null,
    f.start?.guard && f.end?.guard ? `${f.start.guard} → ${f.end.guard}` : f.start?.guard ? `From ${f.start.guard}` : null,
    f.foil ? "Foil finish" : null,
  ] : [];
  add("fade", "Fade", fadeTags);
  add("back", "Back", [...(s.back?.guard ?? []), s.back?.blend ? word(s.back.blend) : null]);
  add("top", "Top", [len(s.top?.length), ...(s.top?.technique ?? []).map(word), ...(s.top?.texture ?? []).map(word), s.top?.leaveLonger ? "Leave longer" : null, s.top?.direction ? word(s.top.direction) : null]);
  add("neckline", "Neckline", (s.neckline?.shape ?? []).map(word));
  add("sideburns", "Sideburns", [s.sideburns?.length ? word(s.sideburns.length) : null, ...(s.sideburns?.shape ?? []).map(word)]);
  add("beard", "Beard", s.beard ? [s.beard.guard ?? null, s.beard.shape ? word(s.beard.shape) : null, s.beard.lineUp ? "Line up" : null, s.beard.blendIntoFade ? "Blend into fade" : null] : []);
  add("hairline", "Hairline", s.hairline ? [s.hairline.lineUp ? "Line up" : null, s.hairline.shape ? word(s.hairline.shape) : null] : []);
  add("hair", "Hair", s.hair ? [s.hair.texture ? word(s.hair.texture) : null, s.hair.density ? word(s.hair.density) : null, ...(s.hair.growthPatterns ?? [])] : []);
  add("textured", "Textured", s.textured ? [s.textured.style ? word(s.textured.style) : null, s.textured.maintenance ?? null, s.textured.parts ?? null] : []);
  add("finish", "Finish", s.finish ? [...(s.finish.products ?? []), s.finish.look ? word(s.finish.look) : null] : []);
  const notes = [s.instructions, extra.notes].filter((x) => typeof x === "string" && x.trim()).join("\n");
  add("notes", "Barber notes", [], notes || null);
  return rows;
}
