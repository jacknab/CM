import { describe, expect, it } from "vitest";
import { NAIL_PHRASES, NAIL_PATTERNS } from "./nailPhrases";
import { NAIL_PHRASES_FR, NAIL_PATTERNS_FR } from "./nailPhrasesFr";

// A translation may leave out a slot (a plural ending like {1} = "s"), never use one the English doesn't have.
const extraSlots = (en: string, t: string) => (t.match(/\{\d\}/g) ?? []).filter((s) => !en.includes(s));

describe("/nail French phrases", () => {
  it("most English phrases have French (the rest are sheets that translate themselves, or not English)", () => {
    const english = Object.keys(NAIL_PHRASES).filter((en) => /^[\x20-\x7E·—–…’×→›✓]+$/.test(en) && /[a-z]{2}/i.test(en) && !/[<>{}=]|^[?&/]/.test(en));
    const withFrench = english.filter((en) => NAIL_PHRASES_FR[en]);
    // The list also holds Spanish/French/Vietnamese text the Turn sheets show themselves and some code; those have no French.
    expect(withFrench.length / english.length).toBeGreaterThan(0.9);
  });
  it("French patterns only use {n} slots their English has", () => {
    expect(Object.entries(NAIL_PATTERNS_FR).filter(([en, fr]) => extraSlots(en, fr).length)).toEqual([]);
  });
  it("Vietnamese and Spanish patterns only use {n} slots their English has", () => {
    expect(NAIL_PATTERNS.filter(([en, vi, es]) => extraSlots(en, vi).length || extraSlots(en, es).length)).toEqual([]);
  });
});
