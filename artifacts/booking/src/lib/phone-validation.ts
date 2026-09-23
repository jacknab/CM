/**
 * Phone-number rules for every on-screen phone keypad (check-in, walk-in, client lookup, kiosk, front-desk display).
 * The rules live in shared/usPhone.ts — exactly 10 digits, a currently assigned US geographic area code (no toll-free, reserved
 * or special-use codes), an exchange that starts 2–9 and isn't reserved / fictitious / one repeated digit.
 *
 * `isValidNanpPrefix` is safe to call after every keystroke — it says whether what has been typed so far can still become a real
 * number, so a keypad can refuse just the digit that makes it impossible. `isValidNanpNumber` is the check for a complete number.
 * (The names are from when this only checked the numbering-plan shape; they are kept so every keypad keeps working.)
 */
import { isValidUsPhone, isValidUsPhonePrefix, usPhoneProblem } from "@shared/usPhone";

export const isValidNanpPrefix = isValidUsPhonePrefix;
export const isValidNanpNumber = isValidUsPhone;
/** Why a complete number was refused, in words (null when it is fine). */
export const phoneProblem = usPhoneProblem;
