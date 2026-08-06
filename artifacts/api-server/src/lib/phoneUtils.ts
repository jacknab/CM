/**
 * phoneUtils.ts — canonical E.164 phone normalization for US numbers.
 *
 * Rule: accept any human-typed format, store ONLY E.164 internally.
 * Twilio, SMS routing, AI receptionist, and customer lookup all rely on E.164.
 *
 * toE164US(input)
 *   "+13035551212"   → "+13035551212"   (already E.164)
 *   "3035551212"     → "+13035551212"   (10-digit)
 *   "(303) 555-1212" → "+13035551212"   (formatted)
 *   "13035551212"    → "+13035551212"   (11-digit with country code)
 *   "555-1212"       → null             (too short / invalid)
 *
 * displayPhone(e164)
 *   "+13035551212"   → "(303) 555-1212"
 */

export function toE164US(input: string | null | undefined): string | null {
  if (!input) return null;

  let digits = input.replace(/\D/g, "");

  // Strip leading country code if 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) return null;

  return `+1${digits}`;
}

/**
 * Like toE164US but throws a validation error for invalid numbers.
 * Use at API entry points where a valid phone is required.
 */
export function requireE164US(input: string | null | undefined, fieldName = "phone"): string {
  const e164 = toE164US(input);
  if (!e164) throw Object.assign(new Error(`Invalid US phone number for ${fieldName}: "${input}"`), { code: "INVALID_PHONE" });
  return e164;
}

/**
 * Format an E.164 US number for human-readable display: "(303) 555-1212".
 * Falls back to the raw input if it isn't a valid E.164 US number.
 */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return e164;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * Normalize a raw phone input for DB storage. Returns both E.164 (canonical)
 * and display (human-readable). Returns null fields for invalid numbers.
 */
export function normalizePhone(raw: string | null | undefined): { e164: string | null; display: string } {
  if (!raw) return { e164: null, display: "" };
  const e164 = toE164US(raw);
  return { e164, display: e164 ? displayPhone(e164) : raw.trim() };
}
