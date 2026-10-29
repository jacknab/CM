/**
 * The reason given when cancelling a ticket a technician already worked on (owner, 2026-10-29): at least 3 real words,
 * so "no" or "mmm" can't pass. A word has at least 2 letters (any language). Checked on the /nail page and again on the
 * server (PATCH /api/appointments/:id). Returns what's wrong, or null when the reason is fine.
 */
export const SERVICED_CANCEL_MIN_WORDS = 3;

export function servicedCancelReasonWords(reason: string): number {
  return reason.trim().split(/\s+/).filter((w) => (w.match(/\p{L}/gu) ?? []).length >= 2).length;
}

export function servicedCancelReasonProblem(reason: string): string | null {
  if (servicedCancelReasonWords(reason) < SERVICED_CANCEL_MIN_WORDS) return "Write the reason in at least 3 words.";
  return null;
}
