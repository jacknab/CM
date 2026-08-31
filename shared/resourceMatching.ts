/**
 * Maps a service to the type of physical salon resource (pedicure chair vs.
 * nail station) it must occupy during an appointment, based on the service's
 * category (and, for the ambiguous "Combos" category, its name).
 *
 * Shared between the client (NewBooking.tsx resource picker) and the server
 * (auto-assignment + conflict checking in routes.ts) so both sides agree on
 * the same rule without duplicating regexes.
 *
 * Returns null for services that don't need a chair or station at all
 * (waxing, threading, hair, spa, etc.) — those are simply never required to
 * carry a resourceId.
 */
export type RequiredResourceType = "chair" | "station" | null;

const PEDICURE_PATTERN = /\bpedi(?:cures?)?\b/i;
const COMBO_PATTERN = /\bcombos?\b/i;
const NAIL_STATION_PATTERN =
  /\bmani(?:cures?)?\b|\benhancements?\b|\bnail\s*(art|extensions?)\b|\bacrylics?\b|\bgel[\s-]?x\b|\bdip(?:ping)?\s*powder\b|\bsns\b|\bbuilder gel\b|\bhard gel\b|\bpolygel\b|\boverlays?\b|\bfull sets?\b|\bfills?\b|\brefills?\b|\bfrench\b|\bshellac\b|\bgelish\b|\bgel polish\b|\bpolish\b|\bextensions?\b/i;

export function getRequiredResourceType(
  category: string | null | undefined,
  serviceName?: string | null,
): RequiredResourceType {
  const cat = (category || "").trim();
  if (!cat) return null;

  if (PEDICURE_PATTERN.test(cat)) return "chair";

  if (COMBO_PATTERN.test(cat)) {
    // Combo categories can bundle a pedicure with something else — fall back
    // to inspecting the service's own name to decide which resource it needs.
    if (serviceName && PEDICURE_PATTERN.test(serviceName)) return "chair";
    return "station";
  }

  if (NAIL_STATION_PATTERN.test(cat)) return "station";

  return null;
}
