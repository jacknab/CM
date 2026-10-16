/**
 * House calls (Solo plan, plans/solo-work-places-and-approval.md): is the client's address inside the
 * professional's travel radius, and what does the visit add (the flat travel fee)?
 *
 * Addresses are turned into map positions with the US Census geocoder (free, public domain; also used for
 * the salon directory). The professional's base is the business address; its position is the one saved
 * when the address was set (locations.store_latitude/longitude), looked up here if it's missing.
 */
import { pool } from "../db";
import { logger } from "./logger";

export type ClientAddress = { line1: string; line2?: string; city: string; state: string; postcode: string; lat?: number; lng?: number };

export type HouseCallCheck =
  | { ok: true; address: ClientAddress; distanceMiles: number; travelFee: number }
  | { ok: false; reason: "not_offered" | "not_found" | "too_far" | "no_base"; message: string; distanceMiles?: number };

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** A US street address → its map position, or null when the Census geocoder can't place it. */
export async function geocodeAddress(a: { line1: string; city: string; state: string; postcode: string }): Promise<{ lat: number; lng: number } | null> {
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

/** Tidy and check the parts of an address a client typed. Null when a part is missing. */
export function normalizeClientAddress(raw: unknown): ClientAddress | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const address: ClientAddress = {
    line1: text(r.line1, 200), line2: text(r.line2, 100) || undefined,
    city: text(r.city, 100), state: text(r.state, 2).toUpperCase(), postcode: text(r.postcode, 10),
  };
  if (!address.line1 || !address.city || !/^[A-Z]{2}$/.test(address.state) || !/^\d{5}(-\d{4})?$/.test(address.postcode)) return null;
  return address;
}

/**
 * Can this business do a house call at this address? `enforceRadius` is false when the professional books
 * it themselves (they may choose to travel further); the online booking page always enforces it.
 */
export async function checkHouseCall(storeId: number, raw: unknown, opts: { enforceRadius: boolean }): Promise<HouseCallCheck> {
  const { rows } = await pool.query(
    `SELECT house_calls, house_call_radius_miles, house_call_fee, address, city, state, postcode, store_latitude, store_longitude
       FROM locations WHERE id = $1`, [storeId]);
  const store = rows[0];
  if (!store?.house_calls) return { ok: false, reason: "not_offered", message: "This business doesn't do house calls." };
  const address = normalizeClientAddress(raw);
  if (!address) return { ok: false, reason: "not_found", message: "Enter the street address, city, state and ZIP code." };

  const point = await geocodeAddress(address);
  if (!point) return { ok: false, reason: "not_found", message: "We couldn't find that address. Check it and try again." };
  address.lat = point.lat;
  address.lng = point.lng;

  let base = store.store_latitude && store.store_longitude
    ? { lat: Number(store.store_latitude), lng: Number(store.store_longitude) } : null;
  if (!base && store.address && store.city && store.state && store.postcode) {
    base = await geocodeAddress({ line1: store.address, city: store.city, state: store.state, postcode: store.postcode });
    if (base) {
      await pool.query(`UPDATE locations SET store_latitude = $2, store_longitude = $3 WHERE id = $1`, [storeId, String(base.lat), String(base.lng)])
        .catch(() => undefined);
    }
  }
  const travelFee = Number(store.house_call_fee) || 0;
  if (!base) {
    // Without a base the distance can't be measured: the booking page can't check it, the professional can.
    return opts.enforceRadius
      ? { ok: false, reason: "no_base", message: "House calls can't be booked online right now. Please contact the business." }
      : { ok: true, address, distanceMiles: 0, travelFee };
  }
  const distanceMiles = Math.round(milesBetween(base, point) * 10) / 10;
  const radius = Number(store.house_call_radius_miles) || 0;
  if (opts.enforceRadius && distanceMiles > radius) {
    return { ok: false, reason: "too_far", distanceMiles, message: `That address is about ${Math.round(distanceMiles)} miles away. House calls go up to ${radius} miles.` };
  }
  return { ok: true, address, distanceMiles, travelFee };
}

/** Keep the client's address for their next house call. */
export async function saveClientAddress(clientId: number | null | undefined, address: ClientAddress): Promise<void> {
  if (!clientId) return;
  await pool.query(`UPDATE clients SET address = $2 WHERE id = $1`, [clientId, JSON.stringify(address)]).catch(() => undefined);
}
