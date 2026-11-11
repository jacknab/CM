/**
 * Quick Notes (owner, 2026-11-11): a one-screen note after checkout, so the next professional knows how the client
 * likes their service. The template follows the business type; the note text is built here from the choices, with
 * plain sentences (no AI), so the app, the front desk and the server all write the same words.
 *
 * Choices are split in two: `visit` (what was done this time) and `remember` (what should carry forward). Only the
 * `remember` choices are preferences; a visit choice is never treated as a lasting one.
 */

export type QuickNoteTemplateId = "nail" | "hair" | "generic";

export interface QuickNoteField {
  key: string;
  label: string;
  options: string[];
  /** More than one can be picked. */
  multi?: boolean;
  /** Carries forward to future visits (a preference), instead of describing this visit. */
  remember?: boolean;
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
  generic: {
    id: "generic",
    fields: [
      { key: "remember", label: "Remember for Next Time", multi: true, remember: true,
        options: ["Same professional", "Sensitive skin", "Prefers a quiet visit"] },
    ],
  },
};

/** Nail salons get the nail template; hair salons and barbershops the haircut one; every other business the short one. */
export function quickNoteTemplateFor(category: string | null | undefined): QuickNoteTemplate {
  const c = String(category ?? "").toLowerCase();
  if (/nail/.test(c)) return QUICK_NOTE_TEMPLATES.nail;
  if (/barber|hair/.test(c)) return QUICK_NOTE_TEMPLATES.hair;
  return QUICK_NOTE_TEMPLATES.generic;
}

/** The choices: one option per single field, a list for a multi field. */
export type QuickNoteChoices = Record<string, string | string[] | undefined>;

/** Keeps only real options of this template's fields (anything else sent is dropped). */
export function cleanQuickNoteChoices(template: QuickNoteTemplate, raw: unknown): QuickNoteChoices {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: QuickNoteChoices = {};
  for (const f of template.fields) {
    const v = src[f.key];
    if (f.multi) {
      const picked = Array.isArray(v) ? f.options.filter((o) => v.includes(o)) : [];
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

function genericSentences(c: QuickNoteChoices): string[] {
  const remember = many(c, "remember").map((r) => GENERIC_REMEMBER[r]).filter(Boolean);
  return remember.length ? [`${cap(list(remember))}.`] : [];
}

/**
 * The note in plain sentences: only what was picked, then the professional's own words. Empty when nothing was
 * picked or written (there is then nothing to save).
 */
export function buildQuickNoteText(templateId: QuickNoteTemplateId, choices: QuickNoteChoices, extra?: string | null): string {
  const sentences = templateId === "nail" ? nailSentences(choices) : templateId === "hair" ? hairSentences(choices) : genericSentences(choices);
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
