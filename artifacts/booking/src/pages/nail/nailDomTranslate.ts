/**
 * The /nail Language setting (MORE → Language) applied to ALL the text on the screen (owner, 2026-10-24): every text
 * node, placeholder, title and screen-reader label under the page — the MORE popup, sheets and dialogs included — is
 * swapped for its Vietnamese, Spanish or French phrase (nailPhrases.ts, nailPhrasesFr.ts) while that language is chosen, and put back when the
 * tablet goes back to English.
 *
 * Only text that is exactly a known phrase (or one of the known sentences around a name or number) changes, so client
 * names, service names, amounts and anything typed are never touched. Inputs, text areas and anything marked
 * `data-no-translate` are skipped. React keeps rendering English; when it changes a text node the observer translates
 * the new text, and it remembers each node's English so switching language (or back to English) is exact.
 */
import { useEffect } from "react";
import type { NailLang } from "./i18n";

type Phrases = typeof import("./nailPhrases");
type FrPhrases = typeof import("./nailPhrasesFr");
let phrases: Phrases | null = null;
let fr: FrPhrases | null = null;
let loading: Promise<unknown> | null = null;
// French (nailPhrasesFr.ts) is keyed by the same English as nailPhrases.ts.
const loadPhrases = () => (loading ??= Promise.all([
  import("./nailPhrases").then((m) => (phrases = m)),
  import("./nailPhrasesFr").then((m) => (fr = m)),
]));

const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE"]);

/** English of each text node / attribute we changed, and what we put there (to tell our change from React's). */
const originalText = new WeakMap<Text, string>();
const shownText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();

type Lang3 = "vi" | "es" | "fr";
let compiled: { re: RegExp; vi: string; es: string; fr: string | undefined }[] | null = null;
let lowerIndex: Map<string, string> | null = null;

/** The phrase for this English in `lang` (undefined when it has none in that language). */
function phraseFor(english: string, lang: Lang3): string | undefined {
  if (lang === "fr") return fr?.NAIL_PHRASES_FR[english];
  const row = phrases?.NAIL_PHRASES[english];
  return row ? row[lang === "vi" ? 0 : 1] : undefined;
}

/** The salon's own catalog names (services, add-ons, categories) → their stored translations (entity_translations),
 *  set by useNailCatalogNames. A text that is exactly one of these names shows translated; anything else is untouched. */
let catalogNames = new Map<string, Partial<Record<Lang3, string>>>();
export function setNailCatalogNames(names: Map<string, Partial<Record<Lang3, string>>>) { catalogNames = names; }

function lookup(english: string, lang: Lang3): string | null {
  const named = catalogNames.get(english)?.[lang];
  if (named) return named;
  if (!phrases) return null;
  const exact = phraseFor(english, lang);
  if (exact) return exact;
  // Same words in different capitals: an ALL CAPS label gets the phrase in capitals.
  lowerIndex ??= new Map(Object.keys(phrases.NAIL_PHRASES).map((k) => [k.toLowerCase(), k]));
  const key = lowerIndex.get(english.toLowerCase());
  const loose = key ? phraseFor(key, lang) : undefined;
  if (loose) return english === english.toUpperCase() && /[A-Z]/.test(english) ? loose.toLocaleUpperCase(lang) : loose;
  // The same label shown without its colon ("Daily Total" for "Daily Total:"), or with one.
  if (!english.endsWith(":")) { const withColon = phraseFor(`${english}:`, lang); if (withColon) return withColon.replace(/\s*:\s*$/, ""); }
  else { const bare = phraseFor(english.slice(0, -1).trim(), lang); if (bare) return `${bare}:`; }
  // French-only patterns too: sheets that translate themselves into Vietnamese and Spanish show English under French.
  const frOnly = Object.keys(fr?.NAIL_PATTERNS_FR ?? {}).filter((en) => !phrases!.NAIL_PATTERNS.some((p) => p[0] === en));
  compiled ??= [...phrases.NAIL_PATTERNS, ...frOnly.map((en) => [en, "", ""] as const)].map(([en, vi, es]) => ({
    re: new RegExp("^" + en.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\d)\}/g, "(?<p$1>.+?)") + "$"),
    vi, es, fr: fr?.NAIL_PATTERNS_FR[en],
  }));
  for (const p of compiled) {
    const m = p.re.exec(english);
    const out = lang === "vi" ? p.vi : lang === "es" ? p.es : p.fr;
    if (m && out) return out.replace(/\{(\d)\}/g, (_, n) => m.groups?.[`p${n}`] ?? "");
  }
  return null;
}

/** "  Clock In " → "  Vào ca ": the phrase is matched without its surrounding spaces, which are kept. */
function translateString(s: string, lang: NailLang): string | null {
  if (lang === "en") return null;
  const core = s.trim();
  if (!core || !/[A-Za-z]/.test(core)) return null;
  const t = lookup(core, lang);
  return t == null ? null : s.slice(0, s.indexOf(core)) + t + s.slice(s.indexOf(core) + core.length);
}

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.hasAttribute("data-no-translate") || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function applyText(node: Text, lang: NailLang) {
  const now = node.nodeValue ?? "";
  // React put new English here since we last changed it: that is the node's English now.
  if (shownText.get(node) !== now) { originalText.set(node, now); shownText.delete(node); }
  const english = originalText.get(node) ?? now;
  if (skipped(node.parentElement)) return;
  const next = lang === "en" ? english : translateString(english, lang) ?? english;
  if (next !== now) { node.nodeValue = next; }
  if (next !== english) shownText.set(node, next); else shownText.delete(node);
}

function applyAttrs(el: Element, lang: NailLang) {
  if (el.closest("[data-no-translate]")) return;
  let saved = originalAttr.get(el);
  for (const a of ATTRS) {
    const now = el.getAttribute(a);
    if (now == null) continue;
    const mine = saved?.get(`shown:${a}`);
    if (mine !== now) { saved ??= new Map(); saved.set(a, now); saved.delete(`shown:${a}`); originalAttr.set(el, saved); }
    const english = saved?.get(a) ?? now;
    const next = lang === "en" ? english : translateString(english, lang) ?? english;
    if (next !== now) el.setAttribute(a, next);
    if (next !== english) { saved ??= new Map(); saved.set(`shown:${a}`, next); originalAttr.set(el, saved); }
  }
}

function applyTree(root: Node, lang: NailLang) {
  if (root.nodeType === Node.TEXT_NODE) { applyText(root as Text, lang); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP_TAGS.has(el.tagName) && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
  applyAttrs(el, lang);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) applyText(n as Text, lang); else applyAttrs(n as Element, lang);
  }
}

/** Put the page in `lang` and keep it there as it changes; returns stop(). (The hook below; also used by tests.) */
export function startNailTranslation(lang: NailLang, onReady?: () => void): () => void {
  let cancelled = false;
  let observer: MutationObserver | null = null;
  const start = () => {
    if (cancelled) return;
    applyTree(document.body, lang);
    onReady?.();
    if (lang === "en") return; // back to English: everything restored, nothing more to watch
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") applyText(r.target as Text, lang);
        else if (r.type === "attributes") applyAttrs(r.target as Element, lang);
        else r.addedNodes.forEach((n) => applyTree(n, lang));
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  };
  if (lang === "en" || phrases) start(); else void loadPhrases().then(start);
  return () => { cancelled = true; observer?.disconnect(); };
}

/** Keep everything on the page in `lang` while the /nail screen is open. `catalogVersion` changes when the salon's
 *  catalog names arrive, so text already on screen is looked at again. */
export function useNailDomTranslation(lang: NailLang, catalogVersion = 0) {
  useEffect(() => startNailTranslation(lang), [lang, catalogVersion]);
  // Leaving /nail: put the rest of the app back in English.
  useEffect(() => () => { if (phrases) applyTree(document.body, "en"); }, []);
}
