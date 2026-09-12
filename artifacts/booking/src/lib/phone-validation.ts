/**
 * Structural validation for North American Numbering Plan (NANP) numbers:
 * NXX-NXX-XXXX, where each N is 2-9 and neither the area code nor the
 * exchange code may be an "N11" pattern (211/411/511/611/711/811/911 are
 * reserved service codes, not assignable area/exchange codes).
 *
 * `isValidNanpPrefix` is safe to call after every keystroke on a digit-by-
 * digit keypad — it validates whatever has been typed so far (1-10 digits)
 * against the positions that are already determined, so a bad digit is
 * caught the instant it makes the number structurally impossible rather
 * than waiting for all 10 digits.
 */
export function isValidNanpPrefix(digits: string): boolean {
  if (!/^\d{0,10}$/.test(digits)) return false;
  if (digits.length >= 1 && !/[2-9]/.test(digits[0])) return false; // area code N
  if (digits.length >= 3 && digits[1] === "1" && digits[2] === "1") return false; // area code N11
  if (digits.length >= 4 && !/[2-9]/.test(digits[3])) return false; // exchange code N
  if (digits.length >= 6 && digits[4] === "1" && digits[5] === "1") return false; // exchange N11
  return true;
}

export function isValidNanpNumber(digits: string): boolean {
  return digits.length === 10 && isValidNanpPrefix(digits);
}
