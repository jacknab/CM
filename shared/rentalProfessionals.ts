import { z } from "zod";

/**
 * Certxa Rentals — Professional status vocabulary (Phase 3).
 * Mirrors shared/rentalSpaces.ts / shared/appointment-status.ts: single
 * source of truth for server validation + client labels.
 */

export const PROFESSIONAL_STATUSES = ["active", "pending", "inactive", "former"] as const;
export type ProfessionalStatus = (typeof PROFESSIONAL_STATUSES)[number];
export const professionalStatusEnum = z.enum(PROFESSIONAL_STATUSES);

export const PROFESSIONAL_STATUS_LABELS: Record<ProfessionalStatus, string> = {
  active: "Active",
  pending: "Pending",
  inactive: "Inactive",
  former: "Former",
};

/** Shown as help text next to the status — never rely on color alone. */
export const PROFESSIONAL_STATUS_DESCRIPTIONS: Record<ProfessionalStatus, string> = {
  active: "Currently renting and operating at the facility.",
  pending: "Added or being onboarded — not yet active.",
  inactive: "On record but not currently active.",
  former: "Previously rented from the facility; kept for history.",
};

/**
 * No restrictive transition matrix (unlike Space status) — there's no
 * documented domain invariant here comparable to "don't silently end an
 * active agreement." Any status can move to any other; the product guidance
 * is behavioral (prefer Former over deleting a professional with history),
 * not a state machine to enforce.
 */

export interface SocialLink {
  platform: string;
  url: string;
}
