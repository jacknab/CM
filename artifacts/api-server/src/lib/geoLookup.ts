/**
 * IP → city lookup for the marketplace homepage's "featured near you" —
 * mirrors the existing GeoIP pattern in routes/liveChat.ts (same mmdb path,
 * same private-IP guard), kept as its own small module so this feature
 * doesn't need to touch that unrelated file.
 *
 * Best-effort: IP→city accuracy is only ~50-75% for MaxMind's free GeoLite2
 * data, and the DB may be briefly unavailable on a cold boot before the
 * async open() resolves — callers must treat a null result as "show the
 * generic featured list" rather than an error.
 */

import maxmind, { type CityResponse, type Reader } from "maxmind";
import type { Request } from "express";
import { logger } from "./logger";
import { getCityData, STATE_NAMES, US_STATES, toCitySlug, toStateSlug } from "./salonData";

const GEOIP_CITY_DB_PATH = process.env.GEOIP_CITY_DB || "/var/lib/GeoIP/GeoLite2-City.mmdb";

let cityReader: Reader<CityResponse> | null = null;
let readerTried = false;

async function ensureReader(): Promise<void> {
  if (readerTried) return;
  readerTried = true;
  try {
    cityReader = await maxmind.open<CityResponse>(GEOIP_CITY_DB_PATH);
  } catch (err) {
    logger.warn({ err }, "[geoLookup] GeoIP city DB unavailable");
  }
}
void ensureReader();

export function requestIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    ""
  );
}

interface RawIpCity { city: string; stateCode: string }

function lookupRawCity(ip: string): RawIpCity | null {
  if (!ip || !cityReader) return null;
  const bare = ip.replace(/^::ffff:/, "");
  if (
    !/^[0-9a-fA-F:.]+$/.test(bare) ||
    bare.startsWith("10.") || bare.startsWith("192.168.") ||
    bare.startsWith("127.") || bare.startsWith("172.16.")
  ) {
    return null;
  }
  try {
    const r = cityReader.get(bare);
    if (!r || r.country?.iso_code !== "US") return null; // directory is US-only
    const city = r.city?.names?.en;
    const stateCode = r.subdivisions?.[0]?.iso_code;
    if (!city || !stateCode) return null;
    return { city, stateCode };
  } catch (err) {
    logger.warn({ err, ip: bare }, "[geoLookup] city lookup failed");
    return null;
  }
}

export interface VisitorCity {
  city: string;
  state: string;
  citySlug: string;
  stateSlug: string;
}

/**
 * Resolves an IP to a city we actually have listings for. Returns null
 * (rather than a best-guess) when the state isn't a real US state we track,
 * or when we have no salon data at all for the resolved city — callers
 * fall back to the generic featured list in that case.
 */
export function resolveVisitorCity(ip: string): VisitorCity | null {
  const raw = lookupRawCity(ip);
  if (!raw || !US_STATES.has(raw.stateCode)) return null;

  const citySlug = toCitySlug(raw.city);
  const cityData = getCityData(raw.stateCode, citySlug);
  if (!cityData) return null;

  const stateName = STATE_NAMES[raw.stateCode];
  return {
    city: cityData.name,
    state: stateName,
    citySlug,
    stateSlug: toStateSlug(stateName),
  };
}
