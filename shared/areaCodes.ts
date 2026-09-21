/**
 * Quick Area Codes — the three area codes a salon chooses for the phone keypads on the Nail POS.
 * Stored per store as an array of exactly three strings ("" = button left unconfigured). Strings, never numbers.
 */

export const QUICK_AREA_CODE_COUNT = 3;

// Toll-free and premium/special ranges: valid-looking, but never a client's home area code.
const NON_GEOGRAPHIC = new Set(["500", "600", "700", "800", "833", "844", "855", "866", "877", "888", "900"]);

/**
 * A plausible US geographic area code: NXX (N = 2-9), not an N11 service code, not the reserved 37X / 96X blocks, and
 * not a toll-free / premium range. (Canada and the Caribbean share the same numbering plan and can't be told apart from
 * the digits alone, so they pass — the salon is the one choosing.)
 */
export function isValidUsAreaCode(code: string): boolean {
  if (!/^[2-9]\d{2}$/.test(code)) return false;
  if (code[1] === "1" && code[2] === "1") return false; // N11 (211, 311, … 911)
  if (code.startsWith("37") || code.startsWith("96")) return false; // reserved for future use
  return !NON_GEOGRAPHIC.has(code);
}

/** Clean up a saved / submitted list: always exactly three strings, junk becomes "" (unconfigured). */
export function readQuickAreaCodes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: QUICK_AREA_CODE_COUNT }, (_, i) => {
    const v = typeof list[i] === "string" ? list[i].trim() : "";
    return isValidUsAreaCode(v) ? v : "";
  });
}

export type QuickAreaCodesCheck = { ok: true; codes: string[] } | { ok: false; error: string; index: number };

/** Validate a submitted list for saving: blank = unconfigured, anything else must be a valid 3-digit US area code. */
export function checkQuickAreaCodes(raw: unknown): QuickAreaCodesCheck {
  if (!Array.isArray(raw) || raw.length !== QUICK_AREA_CODE_COUNT) {
    return { ok: false, error: `Send exactly ${QUICK_AREA_CODE_COUNT} area codes (leave one blank to skip it).`, index: -1 };
  }
  const codes: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = typeof raw[i] === "string" ? (raw[i] as string).trim() : raw[i] == null ? "" : null;
    if (v === null) return { ok: false, error: `Button ${i + 1}: area codes are text like "720".`, index: i };
    if (v !== "" && !/^\d{3}$/.test(v)) return { ok: false, error: `Button ${i + 1}: enter exactly 3 digits.`, index: i };
    if (v !== "" && !isValidUsAreaCode(v)) return { ok: false, error: `Button ${i + 1}: ${v} isn't a valid US area code.`, index: i };
    codes.push(v);
  }
  return { ok: true, codes };
}
