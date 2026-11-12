/**
 * Quick Notes (owner, 2026-11-11): a one-screen note after checkout, so the next professional knows how the client
 * likes their service. The template follows the business type; the note text is built here from the choices, with
 * plain sentences (no AI), so the app, the front desk and the server all write the same words.
 *
 * Choices are split in two: `visit` (what was done this time) and `remember` (what should carry forward). Only the
 * `remember` choices are preferences; a visit choice is never treated as a lasting one.
 */

export type QuickNoteTemplateId = "nail" | "hair" | "barber" | "generic";

export interface QuickNoteField {
  key: string;
  label: string;
  options: string[];
  /** More than one can be picked. */
  multi?: boolean;
  /** Carries forward to future visits (a preference), instead of describing this visit. */
  remember?: boolean;
  /**
   * Multi fields: two groups that can't be picked together — picking from one clears the other
   * (e.g. "No Fade" against every fade). See toggleQuickNoteOption.
   */
  exclusive?: [string[], string[]];
}

export interface QuickNoteTemplate { id: QuickNoteTemplateId; fields: QuickNoteField[] }

export const QUICK_NOTE_TEMPLATES: Record<QuickNoteTemplateId, QuickNoteTemplate> = {
  nail: {
    id: "nail",
    fields: [
      { key: "shape", label: "Nail Shape", options: ["Square", "Round", "Almond", "Coffin", "Oval"] },
      { key: "length", label: "Length", options: ["Short", "Medium", "Long"] },
      { key: "color", label: "Color Preference", options: ["Nude", "Pink", "Red", "White", "Dark", "No preference"] },
      { key: "remember", label: "Remember for Next Time", multi: true, remember: true,
        options: ["Keep nails short", "Keep nails long", "Gentle cuticles", "Thin natural nails", "Sensitive skin", "Same technician", "Likes designs"] },
    ],
  },
  hair: {
    id: "hair",
    fields: [
      { key: "guard", label: "Back & Sides Guard", options: ["#0", "#0.5", "#1", "#1.5", "#2", "#3", "#4", "#5", "#6"] },
      { key: "fade", label: "Fade Style", options: ["No Fade", "Low", "Mid", "High", "Skin Fade"] },
      { key: "neckline", label: "Neckline", options: ["Natural", "Squared", "Rounded", "Tapered", "Blocked"] },
      { key: "sideburns", label: "Sideburns", options: ["Short", "Mid", "Long", "Tapered", "Natural"] },
      { key: "top", label: "Top Length", options: ["Scissor cut", "1 inch", "2 inches", "3 inches", "Leave longer"] },
    ],
  },
  // Barbershops (owner, 2026-11-12): multi-select pills, barbershop words, haircut only (no facial hair section).
  barber: {
    id: "barber",
    fields: [
      { key: "guard", label: "Back & Sides Guard", multi: true, options: ["Foil/Razor", "#0", "#0.5", "#1", "#1.5", "#2", "#3", "#4", "#5", "#6"] },
      { key: "fade", label: "Fade Style", multi: true, options: ["No Fade", "Low", "Mid", "High", "Skin Fade", "Taper Fade", "Drop/Burst"],
        exclusive: [["No Fade"], ["Low", "Mid", "High", "Skin Fade", "Taper Fade", "Drop/Burst"]] },
      { key: "neckline", label: "Neckline", multi: true, options: ["Natural", "Squared/Blocked", "Rounded", "Tapered", "Faded Out"],
        exclusive: [["Faded Out"], ["Natural", "Squared/Blocked", "Rounded", "Tapered"]] },
      { key: "sideburns", label: "Sideburns", multi: true, options: ["Short", "Mid", "Long", "Tapered", "Natural"] },
      { key: "top", label: "Top Length & Texture", multi: true, options: ["Scissor cut", "1 inch", "2 inches", "3 inches", "Leave longer", "Texturize/Thin"],
        exclusive: [["Leave longer"], ["1 inch", "2 inches", "3 inches"]] },
    ],
  },
  generic: {
    id: "generic",
    fields: [
      { key: "remember", label: "Remember for Next Time", multi: true, remember: true,
        options: ["Same professional", "Sensitive skin", "Prefers a quiet visit"] },
    ],
  },
};

/** Nail salons get the nail template; barbershops the barbershop one; hair salons the haircut one; every other business the short one. */
export function quickNoteTemplateFor(category: string | null | undefined): QuickNoteTemplate {
  const c = String(category ?? "").toLowerCase();
  if (/nail/.test(c)) return QUICK_NOTE_TEMPLATES.nail;
  if (/barber/.test(c)) return QUICK_NOTE_TEMPLATES.barber;
  if (/hair/.test(c)) return QUICK_NOTE_TEMPLATES.hair;
  return QUICK_NOTE_TEMPLATES.generic;
}

/** The choices: one option per single field, a list for a multi field. */
export type QuickNoteChoices = Record<string, string | string[] | undefined>;

/**
 * Tap a pill on a multi field: on/off, and picking from one side of an exclusive pair clears the other side
 * ("No Fade" clears every fade; a fade clears "No Fade").
 */
export function toggleQuickNoteOption(field: QuickNoteField, current: string[], option: string): string[] {
  if (current.includes(option)) return current.filter((o) => o !== option);
  let next = [...current, option];
  for (const [a, b] of field.exclusive ? [field.exclusive, [field.exclusive[1], field.exclusive[0]] as [string[], string[]]] : []) {
    if (a.includes(option)) next = next.filter((o) => !b.includes(o));
  }
  return field.options.filter((o) => next.includes(o)); // menu order
}

/** Keeps only real options of this template's fields (anything else sent is dropped). */
export function cleanQuickNoteChoices(template: QuickNoteTemplate, raw: unknown): QuickNoteChoices {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: QuickNoteChoices = {};
  for (const f of template.fields) {
    const v = src[f.key];
    if (f.multi) {
      let picked = Array.isArray(v) ? f.options.filter((o) => v.includes(o)) : typeof v === "string" && f.options.includes(v) ? [v] : [];
      // Both sides of an exclusive pair sent: the specific picks win over the catch-all ("No Fade", "Leave longer", "Faded Out").
      if (f.exclusive && picked.some((o) => f.exclusive![0].includes(o)) && picked.some((o) => f.exclusive![1].includes(o))) {
        picked = picked.filter((o) => !f.exclusive![0].includes(o));
      }
      if (picked.length) out[f.key] = picked;
    } else if (typeof v === "string" && f.options.includes(v)) out[f.key] = v;
  }
  return out;
}

/** "a, b and c" */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const one = (c: QuickNoteChoices, k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
const many = (c: QuickNoteChoices, k: string) => (Array.isArray(c[k]) ? (c[k] as string[]) : []);

const NAIL_REMEMBER: Record<string, string> = {
  "Keep nails short": "wants nails kept short",
  "Keep nails long": "wants nails kept long",
  "Gentle cuticles": "likes gentle cuticle care",
  "Thin natural nails": "has thin natural nails",
  "Sensitive skin": "has sensitive skin",
  "Same technician": "prefers the same technician",
  "Likes designs": "likes nail designs",
};
const GENERIC_REMEMBER: Record<string, string> = {
  "Same professional": "prefers the same professional",
  "Sensitive skin": "has sensitive skin",
  "Prefers a quiet visit": "prefers a quiet visit",
};
const SIDEBURNS: Record<string, string> = {
  Short: "Sideburns kept short.", Mid: "Sideburns kept at medium length.", Long: "Sideburns kept long.",
  Tapered: "Sideburns tapered.", Natural: "Sideburns left natural.",
};
const TOP: Record<string, string> = {
  "Scissor cut": "Top scissor cut.", "1 inch": "Top cut to 1 inch.", "2 inches": "Top cut to 2 inches.",
  "3 inches": "Top cut to 3 inches.", "Leave longer": "Top left longer.",
};

function nailSentences(c: QuickNoteChoices): string[] {
  const out: string[] = [];
  const shape = one(c, "shape"), length = one(c, "length"), color = one(c, "color");
  const realColor = color && color !== "No preference" ? `${color.toLowerCase()} colors` : "";
  const nails = [shape ? `${shape.toLowerCase()}-shaped` : "", length.toLowerCase()].filter(Boolean);
  if (nails.length) out.push(`Prefers ${nails.join(", ")} nails${realColor ? ` with ${realColor}` : ""}.`);
  else if (realColor) out.push(`Prefers ${realColor}.`);
  if (color === "No preference") out.push("No color preference.");
  const remember = many(c, "remember").map((r) => NAIL_REMEMBER[r]).filter(Boolean);
  if (remember.length) out.push(`${cap(list(remember))}.`);
  return out;
}

function hairSentences(c: QuickNoteChoices): string[] {
  const out: string[] = [];
  const guard = one(c, "guard"), fade = one(c, "fade");
  const fadeWords = fade === "No Fade" ? "no fade" : fade === "Skin Fade" ? "skin fade" : fade ? `${fade.toLowerCase()} fade` : "";
  if (guard) out.push(`Back and sides cut with a ${guard} guard${fadeWords ? ` and ${fadeWords}` : ""}.`);
  else if (fadeWords) out.push(`${cap(fadeWords)}.`);
  if (one(c, "neckline")) out.push(`Neckline ${one(c, "neckline").toLowerCase()}.`);
  if (SIDEBURNS[one(c, "sideburns")]) out.push(SIDEBURNS[one(c, "sideburns")]);
  if (TOP[one(c, "top")]) out.push(TOP[one(c, "top")]);
  return out;
}

const lower = (s: string) => s.toLowerCase();
/** Barbershop note in plain sentences (multi-select): "Back and sides #0 guard, low skin fade. Neckline faded out. …" */
function barberSentences(c: QuickNoteChoices): string[] {
  const out: string[] = [];
  const guards = many(c, "guard"), fades = many(c, "fade");
  const guardWords = guards.length ? list(guards.map((g) => (g === "Foil/Razor" ? "foil/razor" : `${g} guard`))) : "";
  const fadeWords = fades.includes("No Fade") ? "no fade" : fades.length ? (() => { const w = fades.map(lower).join(" "); return /fade/.test(w) ? w : `${w} fade`; })() : "";
  if (guardWords || fadeWords) out.push(`Back and sides: ${[guardWords, fadeWords].filter(Boolean).join(", ")}.`);
  if (many(c, "neckline").length) out.push(`Neckline ${list(many(c, "neckline").map(lower))}.`);
  if (many(c, "sideburns").length) out.push(`Sideburns ${list(many(c, "sideburns").map(lower))}.`);
  if (many(c, "top").length) out.push(`Top: ${list(many(c, "top").map(lower))}.`);
  return out;
}

/**
 * A saved note's choices as the barbershop's lists, for showing (owner, 2026-11-12). Older notes (the haircut
 * template, one choice per field) still read: their old words map onto today's pills.
 */
const OLD_WORDS: Record<string, string> = { Squared: "Squared/Blocked", Blocked: "Squared/Blocked" };
export function quickNoteLists(choices: unknown): Record<"guard" | "fade" | "neckline" | "sideburns" | "top", string[]> {
  const src = choices && typeof choices === "object" ? (choices as Record<string, unknown>) : {};
  const get = (k: string) => {
    const v = src[k];
    const arr = Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
    return [...new Set(arr.filter((x): x is string => typeof x === "string").map((x) => OLD_WORDS[x] ?? x))];
  };
  return { guard: get("guard"), fade: get("fade"), neckline: get("neckline"), sideburns: get("sideburns"), top: get("top") };
}

function genericSentences(c: QuickNoteChoices): string[] {
  const remember = many(c, "remember").map((r) => GENERIC_REMEMBER[r]).filter(Boolean);
  return remember.length ? [`${cap(list(remember))}.`] : [];
}

/**
 * The note in plain sentences: only what was picked, then the professional's own words. Empty when nothing was
 * picked or written (there is then nothing to save).
 */
export function buildQuickNoteText(templateId: QuickNoteTemplateId, choices: QuickNoteChoices, extra?: string | null): string {
  const sentences = templateId === "nail" ? nailSentences(choices) : templateId === "hair" ? hairSentences(choices)
    : templateId === "barber" ? barberSentences(choices) : genericSentences(choices);
  let own = String(extra ?? "").trim().replace(/\s+/g, " ");
  if (own) {
    own = cap(own);
    if (!/[.!?]$/.test(own)) own += ".";
    sentences.push(own);
  }
  return sentences.join(" ");
}

/** The choices that carry forward (the template's `remember` fields), for the client's preferences. */
export function rememberChoices(template: QuickNoteTemplate, choices: QuickNoteChoices): string[] {
  return template.fields.filter((f) => f.remember).flatMap((f) => many(choices, f.key));
}
