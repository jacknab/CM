/**
 * Automatically resolve the IANA timezone for a business location by:
 * 1. Geocoding the address to lat/lng via Nominatim (OpenStreetMap, free, no key)
 * 2. Looking up the timezone from coordinates using tz-lookup (offline, bundled data)
 *
 * Falls back gracefully — never throws. Returns null if lookup fails so the
 * caller can decide whether to keep the existing timezone.
 */

import tzlookup from "tz-lookup";

interface AddressInput {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}

/**
 * Build a query string from address components. More specific = better results.
 */
function buildQuery(loc: AddressInput): string {
  const parts = [loc.address, loc.city, loc.state, loc.postcode, loc.country ?? "US"]
    .map(p => (p ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

export interface ResolvedLocation {
  timezone: string | null;
  /** The same real coordinates already fetched to resolve the timezone —
   * previously discarded after the tzlookup call. Callers should persist
   * these onto locations.storeLatitude/storeLongitude so marketplace
   * features (deal distance, map pins) have real, non-fabricated
   * coordinates without a separate geocoding pass. */
  latitude: number | null;
  longitude: number | null;
}

/**
 * Resolve an IANA timezone string (and the real lat/lng behind it) from a
 * business address. Returns nulls if geocoding fails or no result is found
 * — never throws.
 */
export async function resolveTimezoneFromAddress(loc: AddressInput): Promise<ResolvedLocation> {
  const empty: ResolvedLocation = { timezone: null, latitude: null, longitude: null };
  const query = buildQuery(loc);
  if (!query || query === "US") return empty;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;
    const resp = await fetch(url, {
      headers: {
        // Nominatim requires a User-Agent identifying the application
        "User-Agent": "Certxa/1.0 (salon-management-platform; contact=support@certxa.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000), // 8-second timeout
    });

    if (!resp.ok) {
      console.warn(`[resolveTimezone] Nominatim responded ${resp.status} for query: ${query}`);
      return empty;
    }

    const results = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (!results.length) {
      console.warn(`[resolveTimezone] No geocoding result for: ${query}`);
      return empty;
    }

    const lat = parseFloat(results[0].lat);
    const lon = parseFloat(results[0].lon);
    if (isNaN(lat) || isNaN(lon)) return empty;

    const tz = tzlookup(lat, lon);
    console.log(`[resolveTimezone] ${query} → (${lat}, ${lon}) → ${tz}`);
    return { timezone: tz ?? null, latitude: lat, longitude: lon };
  } catch (err: any) {
    // Network errors, timeouts, or parse failures are non-fatal
    console.warn(`[resolveTimezone] Failed to resolve timezone for "${query}": ${err?.message ?? err}`);
    return empty;
  }
}

/**
 * Determine whether an address update warrants a new timezone lookup.
 * We re-resolve whenever any location field changes.
 */
export function hasAddressChange(input: Record<string, unknown>): boolean {
  return ["address", "city", "state", "postcode"].some(f => f in input);
}
