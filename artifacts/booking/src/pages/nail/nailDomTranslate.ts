/**
 * The /nail Language setting (MORE → Language) applied to ALL the text on the screen (owner, 2026-10-24): every text
 * node, placeholder, title and screen-reader label under the page — the MORE popup, sheets and dialogs included — is
 * swapped for its Vietnamese or Spanish phrase (nailPhrases.ts) while that language is chosen, and put back when the
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
let phrases: Phrases | null = null;
let loading: Promise<Phrases> | null = null;
const loadPhrases = () => (loading ??= import("./nailPhrases").then((m) => (phrases = m)));

const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE"]);

/** English of each text node / attribute we changed, and what we put there (to tell our change from React's). */
const originalText = new WeakMap<Text, string>();
const shownText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();

let compiled: { re: RegExp; vi: string; es: string }[] | null = null;
let lowerIndex: Map<string, readonly [string, string]> | null = null;

function lookup(english: string, lang: "vi" | "es"): string | null {
  if (!phrases) return null;
  const i = lang === "vi" ? 0 : 1;
  const exact = phrases.NAIL_PHRASES[english];
  if (exact) return exact[i];
  // Same words in different capitals: an ALL CAPS label gets the phrase in capitals.
  lowerIndex ??= new Map(Object.entries(phrases.NAIL_PHRASES).map(([k, v]) => [k.toLowerCase(), v]));
  const loose = lowerIndex.get(english.toLowerCase());
  if (loose) return english === english.toUpperCase() && /[A-Z]/.test(english) ? loose[i].toLocaleUpperCase(lang) : loose[i];
  // The same label shown without its colon ("Daily Total" for "Daily Total:"), or with one.
  if (!english.endsWith(":")) { const withColon = phrases.NAIL_PHRASES[`${english}:`]; if (withColon) return withColon[i].replace(/\s*:\s*$/, ""); }
  else { const bare = phrases.NAIL_PHRASES[english.slice(0, -1).trim()]; if (bare) return `${bare[i]}:`; }
  compiled ??= phrases.NAIL_PATTERNS.map(([en, vi, es]) => ({
    re: new RegExp("^" + en.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\d)\}/g, "(?<p$1>.+?)") + "$"),
    vi, es,
  }));
  for (const p of compiled) {
    const m = p.re.exec(english);
    if (m) return (lang === "vi" ? p.vi : p.es).replace(/\{(\d)\}/g, (_, n) => m.groups?.[`p${n}`] ?? "");
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

/** Keep everything on the page in `lang` while the /nail screen is open. */
export function useNailDomTranslation(lang: NailLang) {
  useEffect(() => startNailTranslation(lang), [lang]);
  // Leaving /nail: put the rest of the app back in English.
  useEffect(() => () => { if (phrases) applyTree(document.body, "en"); }, []);
}
