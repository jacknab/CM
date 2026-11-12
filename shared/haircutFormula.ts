/**
 * Last Cut Formula Engine — the haircut formula specification (JSONB, versioned) and the Quick Notes mapping.
 * One module for the server, the booking app and later the Pro app (same pattern as shared/quickNotes.ts).
 *
 * The database only checks the minimum (an object with a numeric `v`, under 32 KB, migration 0354) so the spec can
 * grow without migrations. Everything else is checked here:
 *   - only `v` is required; every section is optional and present only when it applies;
 *   - a save needs at least one section or `instructions`;
 *   - unknown keys are refused, except inside `custom` (≤ 20 keys, values ≤ 200 chars) and `legacy`;
 *   - enum values are lowercase slugs; free text ≤ 1,000 chars.
 * `v` goes up only on a breaking change; upgradeSpec() keeps a converter for every older `v`. Stored versions are never rewritten.
 */
import { z } from "zod";
import { QUICK_NOTE_TEMPLATES, type QuickNoteChoices } from "./quickNotes";

export const SPEC_VERSION = 1;

const text = z.string().trim().max(1000);
const GUARDS = ["#0", "#0.5", "#1", "#1.5", "#2", "#2.5", "#3", "#4", "#5", "#6", "#7", "#8", "foil"] as const;
const guard = z.enum(GUARDS);
const guards = z.array(guard).max(GUARDS.length);
const length = z.object({ value: z.number().positive().max(100), unit: z.enum(["guard", "mm", "in"]) }).strict();
const slugs = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).max(values.length);

export const haircutSpecSchema = z.object({
  v: z.literal(SPEC_VERSION),
  style: z.object({ templateId: z.number().int().positive().optional(), name: z.string().trim().max(120).optional(), category: z.string().trim().max(80).optional() }).strict().optional(),
  methods: slugs(["clipper", "scissor", "razor", "shear-over-comb", "freehand"] as const).optional(),
  sides: z.object({
    guard: guards.optional(),
    technique: slugs(["clipper-over-comb", "scissor-over-comb", "foil", "razor"] as const).optional(),
    length: length.optional(),
    left: z.object({ guard: guards }).strict().optional(),
    right: z.object({ guard: guards }).strict().optional(),
  }).strict().optional(),
  fade: z.object({
    type: z.enum(["none", "skin", "low", "mid", "high", "taper", "drop", "burst", "temple", "shadow"]).optional(),
    height: z.enum(["low", "mid", "high"]).optional(),
    start: z.object({ guard }).strict().optional(),
    end: z.object({ guard }).strict().optional(),
    foil: z.boolean().optional(),
  }).strict().optional(),
  back: z.object({ guard: guards.optional(), blend: z.enum(["seamless", "visible-line", "disconnected"]).optional() }).strict().optional(),
  top: z.object({
    length: length.optional(),
    leaveLonger: z.boolean().optional(),
    texture: slugs(["texturize", "thin", "point-cut"] as const).optional(),
    technique: slugs(["scissor", "clipper", "razor", "freehand"] as const).optional(),
    direction: z.enum(["forward", "back", "up", "side-part-left", "side-part-right", "middle-part", "natural"]).optional(),
  }).strict().optional(),
  hairline: z.object({ lineUp: z.boolean().optional(), shape: z.enum(["natural", "squared", "rounded", "recessed-follow"]).optional() }).strict().optional(),
  neckline: z.object({ shape: slugs(["natural", "squared", "rounded", "tapered", "faded-out"] as const) }).strict().optional(),
  sideburns: z.object({ length: z.enum(["short", "mid", "long"]).optional(), shape: slugs(["tapered", "natural", "squared"] as const).optional() }).strict().optional(),
  beard: z.object({ guard: guard.optional(), blendIntoFade: z.boolean().optional(), lineUp: z.boolean().optional(), shape: z.string().trim().max(60).optional() }).strict().optional(),
  hair: z.object({
    texture: z.enum(["straight", "wavy", "curly", "coily"]).optional(),
    density: z.enum(["fine", "medium", "thick"]).optional(),
    cowlicks: z.array(z.object({ location: z.string().trim().max(40), direction: z.enum(["clockwise", "counterclockwise"]).optional() }).strict()).max(5).optional(),
    growthPatterns: z.array(z.string().trim().max(40)).max(10).optional(),
  }).strict().optional(),
  textured: z.object({ style: z.enum(["braids", "locs", "twists", "waves", "afro", "coils"]).optional(), maintenance: z.string().trim().max(60).optional(), parts: z.string().trim().max(60).optional() }).strict().optional(),
  finish: z.object({ products: z.array(z.string().trim().max(80)).max(10).optional(), look: z.enum(["matte", "natural", "shine"]).optional() }).strict().optional(),
  instructions: text.optional(),
  clientPrefs: z.object({ avoid: z.array(z.string().trim().max(120)).max(10).optional(), notes: text.optional() }).strict().optional(),
  custom: z.record(z.string().max(60), z.string().max(200)).refine((o) => Object.keys(o).length <= 20, "At most 20 custom fields").optional(),
  legacy: z.object({ quickNote: z.unknown().optional(), unmapped: z.record(z.string(), z.unknown()).optional() }).strict().optional(),
}).strict();

export type HaircutSpec = z.infer<typeof haircutSpecSchema>;

/** Older specs → the current one. v1 is the first version, so there is nothing to convert yet. */
export function upgradeSpec(spec: unknown): unknown {
  return spec;
}

/** The sections that describe the cut (everything but `v`, `style` and `legacy`). */
function hasContent(spec: HaircutSpec): boolean {
  return Object.entries(spec).some(([k, v]) => !["v", "style", "legacy"].includes(k) && v !== undefined && !(typeof v === "string" && v === ""));
}

export type SpecCheck = { ok: true; spec: HaircutSpec } | { ok: false; message: string };

/** Validates a spec for saving: the schema, plus "say something about the cut". */
export function checkSpecForSave(raw: unknown): SpecCheck {
  const parsed = haircutSpecSchema.safeParse(upgradeSpec(raw));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, message: `${i.path.join(".") || "spec"}: ${i.message}` };
  }
  if (!hasContent(parsed.data)) return { ok: false, message: "Describe the cut first (pick something or write instructions)." };
  return { ok: true, spec: parsed.data };
}

// ── Quick Notes → spec ──────────────────────────────────────────────────────────
// Only the haircut templates ("barber", "hair") describe a cut. The whole original is always kept in legacy.quickNote,
// and anything not mapped in legacy.unmapped, so the copy is lossless.

export function isHaircutTemplate(templateId: string | null | undefined): boolean {
  return templateId === "barber" || templateId === "hair";
}

const asList = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);
const GUARD_MAP: Record<string, (typeof GUARDS)[number]> = { "#0": "#0", "#0.5": "#0.5", "#1": "#1", "#1.5": "#1.5", "#2": "#2", "#3": "#3", "#4": "#4", "#5": "#5", "#6": "#6" };
const NECKLINE_MAP: Record<string, "natural" | "squared" | "rounded" | "tapered" | "faded-out"> = {
  Natural: "natural", "Squared/Blocked": "squared", Squared: "squared", Blocked: "squared", Rounded: "rounded", Tapered: "tapered", "Faded Out": "faded-out",
};
const TOP_LENGTH: Record<string, number> = { "1 inch": 1, "2 inches": 2, "3 inches": 3 };

export function quickNoteToSpec(templateId: string, choices: QuickNoteChoices, extra?: string | null): HaircutSpec {
  const spec: HaircutSpec = { v: SPEC_VERSION };
  const unmapped: Record<string, unknown> = {};
  const keep = (key: string, value: string) => { (unmapped[key] = (unmapped[key] as string[] | undefined) ?? []); (unmapped[key] as string[]).push(value); };

  for (const g of asList(choices.guard)) {
    if (GUARD_MAP[g]) (spec.sides ??= {}).guard = [...(spec.sides.guard ?? []), GUARD_MAP[g]];
    else if (g === "Foil/Razor") { (spec.sides ??= {}).technique = ["foil"]; (spec.fade ??= {}).foil = true; }
    else keep("guard", g);
  }

  const fades = asList(choices.fade);
  const height = fades.find((f) => f === "Low" || f === "Mid" || f === "High");
  const type = fades.includes("No Fade") ? "none" : fades.includes("Skin Fade") ? "skin" : fades.includes("Taper Fade") ? "taper" : fades.includes("Drop/Burst") ? "drop" : null;
  if (type || height) {
    spec.fade ??= {};
    if (type) spec.fade.type = type;
    else if (height) spec.fade.type = height.toLowerCase() as "low" | "mid" | "high";
    if (height && type !== "none") spec.fade.height = height.toLowerCase() as "low" | "mid" | "high";
  }
  for (const f of fades) if (!["Low", "Mid", "High", "No Fade", "Skin Fade", "Taper Fade", "Drop/Burst"].includes(f)) keep("fade", f);

  for (const n of asList(choices.neckline)) {
    const shape = NECKLINE_MAP[n];
    if (!shape) { keep("neckline", n); continue; }
    spec.neckline ??= { shape: [] };
    if (!spec.neckline.shape.includes(shape)) spec.neckline.shape.push(shape);
  }

  for (const s of asList(choices.sideburns)) {
    if (s === "Short" || s === "Mid" || s === "Long") (spec.sideburns ??= {}).length = s.toLowerCase() as "short" | "mid" | "long";
    else if (s === "Tapered" || s === "Natural") (spec.sideburns ??= {}).shape = [...(spec.sideburns?.shape ?? []), s.toLowerCase() as "tapered" | "natural"];
    else keep("sideburns", s);
  }

  for (const t of asList(choices.top)) {
    if (t === "Scissor cut") (spec.top ??= {}).technique = ["scissor"];
    else if (TOP_LENGTH[t]) (spec.top ??= {}).length = { value: TOP_LENGTH[t], unit: "in" };
    else if (t === "Leave longer") (spec.top ??= {}).leaveLonger = true;
    else if (t === "Texturize/Thin") (spec.top ??= {}).texture = ["texturize", "thin"];
    else keep("top", t);
  }

  const known = new Set(QUICK_NOTE_TEMPLATES[templateId as "barber" | "hair"]?.fields.map((f) => f.key) ?? []);
  for (const [k, v] of Object.entries(choices)) if (!known.has(k) && v !== undefined) unmapped[k] = v;

  const note = (extra ?? "").trim().slice(0, 1000);
  if (note) spec.instructions = note;
  spec.legacy = { quickNote: { template: templateId, choices, extra: extra ?? "" }, ...(Object.keys(unmapped).length ? { unmapped } : {}) };
  return spec;
}
