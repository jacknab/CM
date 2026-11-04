/**
 * House calls (Solo plan, plans/solo-work-places-and-approval.md): is the client's address inside the
 * professional's travel radius, and what does the visit add (the flat travel fee)?
 *
 * The radius is driving miles (owner, 2026-11-04). Addresses are placed by Google, then the US Census geocoder (free;
 * also used for the salon directory) when Google can't; Google's Routes API gives the driving distance. Without Google
 * the check still works, in straight-line miles, so a Google outage never stops a booking.
 *
 * The professional's base is the business address, kept in locations.house_call_base for 30 days or until the address
 * changes (Google's limit on keeping results). store_latitude/longitude is only the fallback: it can be a mile or two out.
 */
import crypto from "node:crypto";
import { pool } from "../db";
import { logger } from "./logger";

export type ClientAddress = { line1: string; line2?: string; city: string; state: string; postcode: string };

export type HouseCallCheck =
  | { ok: true; address: ClientAddress; distanceMiles: number; driving: boolean; travelFee: number }
  | { ok: false; reason: "not_offered" | "not_found" | "too_far" | "no_base"; message: string; distanceMiles?: number };

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const KEEP_DAYS = 30;
const DAY_MS = 86_400_000;
const googleKey = () => process.env.GOOGLE_ROUTES_API_KEY;

type Point = { lat: number; lng: number };
type StreetAddress = { line1: string; city: string; state: string; postcode: string };

/**
 * Google's map position for a street address. Only an exact match counts: for an address it doesn't know, Google
 * answers with the street or the city, which would pass a made-up address.
 */
export async function googleGeocode(a: StreetAddress): Promise<Point | null> {
  const key = googleKey();
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${a.line1}, ${a.city}, ${a.state} ${a.postcode}`)}&components=country:US&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const hit = data?.status === "OK" ? data.results?.[0] : null;
    if (!hit || hit.partial_match || !["ROOFTOP", "RANGE_INTERPOLATED"].includes(hit.geometry?.location_type)) return null;
    const { lat, lng } = hit.geometry.location;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch (err: any) {
    logger.warn({ name: err?.name }, "[houseCalls] Google geocoding failed");
    return null;
  }
}

/** Driving miles between two positions, or null when Google can't say (the caller falls back to a straight line). */
export async function drivingMiles(from: Point, to: Point): Promise<number | null> {
  const key = googleKey();
  if (!key) return null;
  const place = (p: Point) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
      body: JSON.stringify({ origin: place(from), destination: place(to), travelMode: "DRIVE" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { logger.warn({ status: res.status }, "[houseCalls] Google Routes refused"); return null; }
    const data: any = await res.json();
    const meters = Number(data?.routes?.[0]?.distanceMeters);
    return Number.isFinite(meters) && meters >= 0 ? Math.round((meters / 1609.344) * 10) / 10 : null;
  } catch (err: any) {
    logger.warn({ name: err?.name }, "[houseCalls] Google Routes failed");
    return null;
  }
}

/** A US street address → its map position, or null when neither Google nor the Census geocoder can place it. */
export async function geocodeAddress(a: StreetAddress): Promise<Point | null> {
  return (await googleGeocode(a)) ?? censusGeocode(a);
}

async function censusGeocode(a: StreetAddress): Promise<Point | null> {
  const oneLine = `${a.line1}, ${a.city}, ${a.state} ${a.postcode}`;
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(oneLine)}&benchmark=Public_AR_Current&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const match = data?.result?.addressMatches?.[0]?.coordinates;
    return match ? { lat: Number(match.y), lng: Number(match.x) } : null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[houseCalls] geocoding failed");
    return null;
  }
}

const zipPlaces = new Map<string, { city: string; state: string } | null>();

/** The city and state of a US ZIP code, to save typing them. Null when Google doesn't know it. */
export async function placeOfZip(zip: string): Promise<{ city: string; state: string } | null> {
  if (zipPlaces.has(zip)) return zipPlaces.get(zip)!;
  const key = googleKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?components=${encodeURIComponent(`postal_code:${zip}|country:US`)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    const data: any = await res.json();
    const parts: any[] = data?.results?.[0]?.address_components ?? [];
    const part = (type: string) => parts.find((p) => p.types?.includes(type));
    const city = part("locality")?.long_name ?? part("postal_town")?.long_name ?? part("sublocality")?.long_name ?? part("neighborhood")?.long_name;
    const state = part("administrative_area_level_1")?.short_name;
    const place = city && state ? { city: String(city), state: String(state) } : null;
    if (data?.status === "OK" || data?.status === "ZERO_RESULTS") zipPlaces.set(zip, place);
    return place;
  } catch (err: any) {
    logger.warn({ name: err?.name }, "[houseCalls] ZIP lookup failed");
    return null;
  }
}

/** Tidy and check the parts of an address a client typed. Null when a part is missing. */
export function normalizeClientAddress(raw: unknown): ClientAddress | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const address: ClientAddress = {
    line1: text(r.line1, 200), line2: text(r.line2, 100) || undefined,
    // Checked whole, never cut short: "California" must not become "CA".
    city: text(r.city, 100), state: text(r.state, 20).toUpperCase(), postcode: text(r.postcode, 20),
  };
  if (!address.line1 || !address.city || !/^[A-Z]{2}$/.test(address.state) || !/^\d{5}(-\d{4})?$/.test(address.postcode)) return null;
  return address;
}

/** The map position distances are measured from: the business's exact address, kept while it's the same address. */
async function businessBase(storeId: number, store: any): Promise<{ point: Point; key: string } | null> {
  const lookedUpFor = [store.address, store.city, store.state, store.postcode].join(", ");
  const fallback = store.store_latitude && store.store_longitude
    ? { point: { lat: Number(store.store_latitude), lng: Number(store.store_longitude) }, key: lookedUpFor } : null;
  if (!store.address || !store.city || !store.state || !store.postcode) return fallback;
  const saved = store.house_call_base;
  if (saved?.for === lookedUpFor && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && Date.now() - Number(saved.at) < KEEP_DAYS * DAY_MS) {
    return { point: { lat: saved.lat, lng: saved.lng }, key: lookedUpFor };
  }
  const point = await geocodeAddress({ line1: store.address, city: store.city, state: store.state, postcode: store.postcode });
  if (!point) return fallback;
  await pool.query(`UPDATE locations SET house_call_base = $2 WHERE id = $1`, [storeId, JSON.stringify({ for: lookedUpFor, at: Date.now(), ...point })]).catch(() => undefined);
  return { point, key: lookedUpFor };
}

/** The same route costs once: the two addresses, hashed, so nothing about the client is kept. */
const routeKey = (baseKey: string, a: ClientAddress) =>
  crypto.createHash("sha256").update(`${baseKey}|${a.line1}|${a.city}|${a.state}|${a.postcode}`.toLowerCase()).digest("hex");

async function savedMiles(key: string): Promise<number | null> {
  const { rows } = await pool.query(`SELECT miles FROM house_call_distances WHERE key = $1 AND created_at > now() - interval '${KEEP_DAYS} days'`, [key]).catch(() => ({ rows: [] as any[] }));
  return rows[0] ? Number(rows[0].miles) : null;
}

async function saveMiles(key: string, miles: number): Promise<void> {
  await pool.query(`DELETE FROM house_call_distances WHERE created_at <= now() - interval '${KEEP_DAYS} days'`).catch(() => undefined);
  await pool.query(`INSERT INTO house_call_distances (key, miles) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET miles = $2, created_at = now()`, [key, miles]).catch(() => undefined);
}

/**
 * Can this business do a house call at this address? `enforceRadius` is false when the professional books
 * it themselves (they may choose to travel further); the online booking page always enforces it.
 */
export async function checkHouseCall(storeId: number, raw: unknown, opts: { enforceRadius: boolean }): Promise<HouseCallCheck> {
  const { rows } = await pool.query(
    `SELECT house_calls, house_call_radius_miles, house_call_fee, address, city, state, postcode, store_latitude, store_longitude, house_call_base
       FROM locations WHERE id = $1`, [storeId]);
  const store = rows[0];
  if (!store?.house_calls) return { ok: false, reason: "not_offered", message: "This business doesn't do house calls." };
  const address = normalizeClientAddress(raw);
  if (!address) return { ok: false, reason: "not_found", message: "Enter the street address, city, state and ZIP code." };

  const base = await businessBase(storeId, store);
  const travelFee = Number(store.house_call_fee) || 0;
  const key = base ? routeKey(base.key, address) : "";
  const known = base ? await savedMiles(key) : null;
  let distanceMiles = known ?? 0;
  let driving = known != null;
  if (known == null) {
    const point = await geocodeAddress(address);
    if (!point) return { ok: false, reason: "not_found", message: "We couldn't find that address. Check it and try again." };
    if (!base) {
      // Without a base the distance can't be measured: the booking page can't check it, the professional can.
      return opts.enforceRadius
        ? { ok: false, reason: "no_base", message: "House calls can't be booked online right now. Please contact the business." }
        : { ok: true, address, distanceMiles: 0, driving: false, travelFee };
    }
    const road = await drivingMiles(base.point, point);
    driving = road != null;
    distanceMiles = road ?? Math.round(milesBetween(base.point, point) * 10) / 10;
    if (road != null) await saveMiles(key, road);
  }
  const radius = Number(store.house_call_radius_miles) || 0;
  if (opts.enforceRadius && distanceMiles > radius) {
    const unit = driving ? "driving miles" : "miles";
    return { ok: false, reason: "too_far", distanceMiles, message: `That address is about ${Math.round(distanceMiles)} ${unit} away. House calls go up to ${radius} ${unit}.` };
  }
  return { ok: true, address, distanceMiles, driving, travelFee };
}

/** Keep the client's address for their next house call. */
export async function saveClientAddress(clientId: number | null | undefined, address: ClientAddress): Promise<void> {
  if (!clientId) return;
  await pool.query(`UPDATE clients SET address = $2 WHERE id = $1`, [clientId, JSON.stringify(address)]).catch(() => undefined);
}
