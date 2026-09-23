/**
 * Quick Area Codes — the three area codes a salon chooses for the phone keypads on the Nail POS.
 * Stored per store as an array of exactly three strings ("" = button left unconfigured). Strings, never numbers.
 */

import { isAssignedUsAreaCode } from "./usPhone";

export const QUICK_AREA_CODE_COUNT = 3;

/**
 * A currently assigned US geographic area code (shared/usAreaCodes.ts, generated from Google's libphonenumber data). Toll-free,
 * premium, personal-number, N11, reserved (37X / 96X), fictitious and unassigned codes — and Canadian / Caribbean-nation codes —
 * are all refused. The same rule the phone keypads use for the first three digits.
 */
export function isValidUsAreaCode(code: string): boolean {
  return /^\d{3}$/.test(code) && isAssignedUsAreaCode(code);
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
