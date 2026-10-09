import { z } from "zod";

/**
 * Certxa Rentals — Rental Agreement lifecycle (Phase 4).
 *
 * Only two values are ever persisted in `rental_agreements.status`:
 *   - "active"     — the normal state for every agreement, regardless of
 *                     whether its dates are in the past, present, or future.
 *   - "terminated" — the one truly user-controlled action (see
 *                     `terminatedAt`), ending the agreement early.
 *
 * Everything else the owner sees (Upcoming / Active / Ending / Ended) is a
 * DERIVED display state computed from status + startDate + endDate/terminatedAt
 * against "today" in the facility's own timezone — never a value a user sets
 * directly. This is deliberate: Section 13 of the Phase 4 spec requires that
 * "status should not be allowed to contradict the agreement dates without an
 * intentional action" — making every date-driven state a pure function of the
 * dates means it structurally cannot contradict them. "Draft" is reserved in
 * the display vocabulary for a future partial-save workflow; nothing in
 * Phase 4 produces it.
 */

export const AGREEMENT_STATUSES = ["active", "terminated"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const agreementStatusEnum = z.enum(AGREEMENT_STATUSES);

export const AGREEMENT_LIFECYCLE_STATES = ["draft", "upcoming", "active", "ending", "ended", "terminated"] as const;
export type AgreementLifecycle = (typeof AGREEMENT_LIFECYCLE_STATES)[number];

export const AGREEMENT_LIFECYCLE_LABELS: Record<AgreementLifecycle, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ending: "Ending Soon",
  ended: "Ended",
  terminated: "Terminated",
};

export const AGREEMENT_LIFECYCLE_DESCRIPTIONS: Record<AgreementLifecycle, string> = {
  draft: "Not yet finalized.",
  upcoming: "Starts in the future — not yet in effect.",
  active: "Currently in effect.",
  ending: "Scheduled to end soon.",
  ended: "Reached its end date; kept for history.",
  terminated: "Ended early by the facility; kept for history.",
};

/** An agreement whose end date falls within this many days counts as "Ending Soon" rather than plain "Active". */
export const AGREEMENT_ENDING_SOON_DAYS = 30;

export const RENT_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type RentFrequency = (typeof RENT_FREQUENCIES)[number];
export const rentFrequencyEnum = z.enum(RENT_FREQUENCIES);

export const RENT_FREQUENCY_LABELS: Record<RentFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export interface AgreementLifecycleInput {
  status: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  terminatedAt: Date | string | null;
}

/**
 * Pure function: derives the display lifecycle from stored status + dates.
 * `today` must already be "midnight, facility-local-date, expressed as a UTC
 * Date" (see lib/timezone.ts's salonDayBoundaries) — never server wall-clock.
 */
export function deriveAgreementLifecycle(agreement: AgreementLifecycleInput, today: Date): AgreementLifecycle {
  if (agreement.status === "terminated") return "terminated";

  const start = agreement.startDate ? new Date(agreement.startDate) : null;
  const end = agreement.endDate ? new Date(agreement.endDate) : null;

  if (start && start.getTime() > today.getTime()) return "upcoming";
  if (end && end.getTime() < today.getTime()) return "ended";
  if (end) {
    const daysUntilEnd = Math.floor((end.getTime() - today.getTime()) / 86_400_000);
    if (daysUntilEnd <= AGREEMENT_ENDING_SOON_DAYS) return "ending";
  }
  return "active";
}

/** True if an agreement is "currently occupying" its space as of `today` — drives the Space status auto-sync (see routes/rentals.ts). */
export function isAgreementCurrentlyEffective(agreement: AgreementLifecycleInput, today: Date): boolean {
  const state = deriveAgreementLifecycle(agreement, today);
  return state === "active" || state === "ending";
}

/**
 * Interval-overlap check for two agreements on the same Space. `end === null`
 * is treated as open-ended (month-to-month) — i.e. extending indefinitely.
 * Two ranges overlap iff each starts before (or when) the other ends.
 */
export function dateRangesOverlap(
  aStart: Date, aEnd: Date | null,
  bStart: Date, bEnd: Date | null,
): boolean {
  const aEndsAfterBStarts = aEnd === null || aEnd.getTime() >= bStart.getTime();
  const bEndsAfterAStarts = bEnd === null || bEnd.getTime() >= aStart.getTime();
  return aEndsAfterBStarts && bEndsAfterAStarts;
}
