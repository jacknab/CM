/**
 * Gift card numbers and PINs — the pure parts (no database), so they can be tested on their own.
 *
 *   Number:  AAAA SSSS BBBB  — 12 digits, numeric only.
 *            A and B are cryptographically random (crypto.randomInt); S is the salon's own store code.
 *            Nothing is counted or derived from the previous card, so numbers are not sequential or guessable.
 *   PIN:     3 random digits, made with the card and shown once. Only an HMAC of number:pin is ever stored.
 *
 * Old cards look like GC-XXXXXXXX; they stay valid and are told apart by not being 12 digits ("legacy").
 */
import { createHmac, randomInt, timingSafeEqual } from "crypto";

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export const CARD_DIGITS = 12;
export const STORE_CODE_DIGITS = 4;
export const PIN_DIGITS = 3;
/** Wrong PINs in a row before a card locks, and for how long. */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

/** A random 4-digit store code ("0000"–"9999"). Uniqueness across salons is the database's job. */
export const generateStoreCode = (rnd: (max: number) => number = (m) => randomInt(0, m)): string => pad(rnd(10 ** STORE_CODE_DIGITS), STORE_CODE_DIGITS);

/** A new card number for the salon with this store code: 4 random digits + store code + 4 random digits. */
export function generateCardNumber(storeCode: string, rnd: (max: number) => number = (m) => randomInt(0, m)): string {
  if (!/^\d{4}$/.test(storeCode)) throw new Error("Store code must be 4 digits");
  return pad(rnd(10_000), 4) + storeCode + pad(rnd(10_000), 4);
}

export const generatePin = (rnd: (max: number) => number = (m) => randomInt(0, m)): string => pad(rnd(10 ** PIN_DIGITS), PIN_DIGITS);

/** "482719367054" → "4827 1936 7054". Anything that isn't a 12-digit number (legacy codes) is returned unchanged. */
export const formatCardNumber = (code: string): string => (/^\d{12}$/.test(code) ? `${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8)}` : code);

/** What was typed or scanned → the stored form: 12 digits with the spaces/dashes gone, or a legacy code upper-cased. "" if empty. */
export function normalizeCardNumber(raw: unknown): string {
  const t = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const digits = t.replace(/-/g, "");
  return /^\d{12}$/.test(digits) ? digits : t;
}

export const isNewFormat = (code: string): boolean => /^\d{12}$/.test(code);
/** The middle group of a new-format number — the salon's store code. */
export const storeCodeOf = (code: string): string => code.slice(4, 8);
export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{3}$/.test(pin);

function pepper(): string {
  const p = process.env.GIFT_CARD_PIN_SECRET || process.env.SESSION_SECRET;
  if (!p) throw new Error("GIFT_CARD_PIN_SECRET (or SESSION_SECRET) must be set to hash gift card PINs");
  return p;
}

/** HMAC of number:pin. Tying it to the number means two cards with the same PIN never share a hash. */
export const hashPin = (code: string, pin: string, secret: string = pepper()): string => createHmac("sha256", secret).update(`${code}:${pin}`).digest("hex");

/** Constant-time comparison. */
export function pinMatches(code: string, pin: string, storedHash: string, secret: string = pepper()): boolean {
  const a = Buffer.from(hashPin(code, pin, secret), "hex");
  let b: Buffer;
  try { b = Buffer.from(storedHash, "hex"); } catch { return false; }
  return a.length === b.length && timingSafeEqual(a, b);
}
