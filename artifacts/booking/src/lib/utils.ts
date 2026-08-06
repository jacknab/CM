import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow, format } from "date-fns"

/**
 * Convert an E.164 US number ("+15551234567") to formatted display "(555) 123-4567".
 * Leaves the string unchanged if it can't be parsed.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * Strip an E.164 number to bare 10 digits for use in <input type="tel">.
 * "+15551234567" → "5551234567". Falls back to stripping non-digits.
 */
export function e164ToInputDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Format a phone input value as the user types, producing "(555) 123-4567".
 * Strips non-digits, caps at 10, and applies progressive masking.
 * Safe to call in every onChange — passes through to backend as-is since
 * the backend normalises any format to E.164.
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safely call formatDistanceToNow — returns fallback when date is null/invalid. */
export function safeDistanceToNow(
  date: string | Date | null | undefined,
  opts?: { addSuffix?: boolean },
  fallback = "—"
): string {
  if (!date) return fallback;
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return fallback;
    return formatDistanceToNow(d, opts);
  } catch {
    return fallback;
  }
}

/** Safely call date-fns format — returns fallback when date is null/invalid. */
export function safeFormat(
  date: string | Date | null | undefined,
  fmt: string,
  fallback = "—"
): string {
  if (!date) return fallback;
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}
