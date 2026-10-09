import { z } from "zod";

/**
 * Certxa Rentals — Space type & status vocabulary (Phase 2).
 *
 * Single source of truth for both server-side validation and client-side
 * labels/badges, mirroring the pattern in shared/appointment-status.ts.
 * `rental_spaces.type`/`.status` are plain TEXT columns (matching the rest
 * of this schema's convention of text-with-comment over pgEnum) — the real
 * constraint lives here, not in the database.
 */

export const SPACE_TYPES = ["suite", "booth", "treatment_room", "other"] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];
export const spaceTypeEnum = z.enum(SPACE_TYPES);

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  suite: "Suite",
  booth: "Booth",
  treatment_room: "Treatment Room",
  other: "Other",
};

export const SPACE_STATUSES = ["available", "occupied", "reserved", "maintenance", "inactive"] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];
export const spaceStatusEnum = z.enum(SPACE_STATUSES);

export const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  reserved: "Reserved",
  maintenance: "Maintenance",
  inactive: "Inactive",
};

/** Shown as help text next to the status — status meaning should never rely on color alone. */
export const SPACE_STATUS_DESCRIPTIONS: Record<SpaceStatus, string> = {
  available: "Ready to be rented to a professional.",
  occupied: "Assigned to an active professional.",
  reserved: "Being held for an upcoming rental.",
  maintenance: "Not rentable until maintenance is resolved.",
  inactive: "Intentionally not available for rental.",
};

/**
 * Legitimate next statuses from each current status. Enforced server-side
 * (routes/rentals.ts), not just hidden in the UI. `occupied -> available` is
 * intentionally allowed here even though the Phase 2 UI doesn't surface it as
 * a primary action — the route additionally refuses it if an active
 * rentalAgreement exists on the space, so once Agreements are real this
 * transition safely stops silently ending one.
 */
export const SPACE_STATUS_TRANSITIONS: Record<SpaceStatus, readonly SpaceStatus[]> = {
  available: ["reserved", "occupied", "maintenance", "inactive"],
  reserved: ["available", "occupied", "maintenance", "inactive"],
  occupied: ["maintenance", "available"],
  maintenance: ["available", "inactive"],
  inactive: ["available"],
};

export function canTransitionSpaceStatus(from: SpaceStatus, to: SpaceStatus): boolean {
  if (from === to) return true;
  return SPACE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Starting suggestions only, not an enforced catalogue — the column is a freeform string array so it can grow without a migration. */
export const SUGGESTED_SPACE_AMENITIES = [
  "Sink",
  "Window",
  "Storage",
  "Natural Light",
  "Private",
  "Shared",
  "Equipment Included",
  "Lockable",
  "Wi-Fi",
] as const;
