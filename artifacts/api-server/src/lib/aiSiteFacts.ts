/**
 * "Here's your business as I know it" (owner, 2026-11-09; plans/ai-website-builder.md, Stage 1): everything Certxa
 * holds that a booking website needs, each fact tagged with where it came from, and the gaps that keep it from being a
 * good site. Certxa's own data first; Google Business Profile, Google, Yelp and the old website fill gaps in a later
 * step. Truth rules: prices only from the catalogue; a private address shows the city only.
 */
import { pool } from "../db";
import { addressIsPrivate } from "./publicStore";

export type SiteFacts = {
  business: {
    name: string; kind: string; phone: string | null; email: string | null;
    area: string | null; streetAddress: string | null; privateAddress: boolean;
    about: string | null; instagram: string | null; bookingLink: string | null;
    houseCalls: { radiusMiles: number | null; fee: number | null } | null;
    cancellationPolicy: string | null;
  };
  services: { name: string; category: string | null; price: number | null; minutes: number | null }[];
  hours: { day: string; open: string | null; close: string | null }[];
  team: { name: string; bio: string | null }[];
  reviews: { rating: number; text: string; service: string | null }[];
  rating: { average: number; count: number } | null;
  photos: number;
  missing: ("prices" | "hours" | "phone" | "location" | "photos" | "about" | "services")[];
  sources: string[];
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function siteFacts(storeId: number): Promise<SiteFacts> {
  const s = (await pool.query(
    `SELECT name, category, phone, email, address, city, state, postcode, booking_slug, booking_site, own_place, address_private,
            house_calls, house_call_radius_miles, house_call_fee, cancellation_policy_text
       FROM locations WHERE id = $1`, [storeId])).rows[0];
  if (!s) throw new Error("Business not found");
  const [services, hours, team, reviews, photos] = await Promise.all([
    pool.query(`SELECT name, category, price::float8 AS price, duration FROM services
                 WHERE store_id = $1 AND is_active = true AND COALESCE(hidden_from_public, false) = false ORDER BY category NULLS LAST, name LIMIT 80`, [storeId]),
    pool.query(`SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE store_id = $1`, [storeId]),
    pool.query(`SELECT name, bio FROM staff WHERE store_id = $1 AND COALESCE(status, '') NOT IN ('removed', 'deactivated') AND COALESCE(show_on_calendar, true) ORDER BY id LIMIT 12`, [storeId]),
    pool.query(`SELECT rating, comment, service_name FROM reviews WHERE store_id = $1 AND is_public = true AND COALESCE(comment, '') <> '' ORDER BY is_featured DESC, created_at DESC LIMIT 15`, [storeId]),
    pool.query(`SELECT count(*)::int AS n FROM wb_gallery_photos WHERE store_id = $1 AND COALESCE(show_on_website, true)`, [storeId]),
  ]);
  const ratingRow = (await pool.query(`SELECT avg(rating)::float8 AS a, count(*)::int AS n FROM reviews WHERE store_id = $1 AND is_public = true`, [storeId])).rows[0];
  const site = (s.booking_site ?? {}) as { about?: string; instagram?: string };
  const privateAddress = addressIsPrivate({ ownPlace: s.own_place, addressPrivate: s.address_private });

  const facts: SiteFacts = {
    business: {
      name: String(s.name ?? "").trim(), kind: String(s.category ?? "").trim() || "Beauty",
      phone: s.phone || null, email: s.email || null,
      area: [s.city, s.state].filter(Boolean).join(", ") || null,
      streetAddress: !privateAddress && s.address ? [s.address, s.city, s.state, s.postcode].filter(Boolean).join(", ") : null,
      privateAddress,
      about: site.about?.trim() || null, instagram: site.instagram?.trim() || null,
      bookingLink: s.booking_slug ? `https://${s.booking_slug}.certxa.com` : null,
      houseCalls: s.house_calls ? { radiusMiles: s.house_call_radius_miles != null ? Number(s.house_call_radius_miles) : null, fee: s.house_call_fee != null ? Number(s.house_call_fee) : null } : null,
      cancellationPolicy: s.cancellation_policy_text?.trim() || null,
    },
    services: services.rows.map((r: any) => ({ name: r.name, category: r.category ?? null, price: r.price != null && Number(r.price) > 0 ? Number(r.price) : null, minutes: r.duration != null ? Number(r.duration) : null })),
    hours: DAYS.map((day, i) => {
      const h = hours.rows.find((r: any) => Number(r.day_of_week) === i);
      return h && !h.is_closed && h.open_time && h.close_time ? { day, open: String(h.open_time).slice(0, 5), close: String(h.close_time).slice(0, 5) } : { day, open: null, close: null };
    }),
    team: team.rows.map((r: any) => ({ name: String(r.name).trim(), bio: r.bio?.trim() || null })).filter((t) => t.name),
    reviews: reviews.rows.map((r: any) => ({ rating: Number(r.rating), text: String(r.comment).trim().slice(0, 400), service: r.service_name ?? null })),
    rating: Number(ratingRow?.n) > 0 ? { average: Math.round(Number(ratingRow.a) * 10) / 10, count: Number(ratingRow.n) } : null,
    photos: Number(photos.rows[0]?.n ?? 0),
    missing: [],
    sources: ["certxa"],
  };
  // What keeps it from being a good booking site (Stage 1 enough-check).
  if (facts.services.length === 0) facts.missing.push("services");
  else if (facts.services.filter((x) => x.price != null).length < Math.min(3, facts.services.length)) facts.missing.push("prices");
  if (!facts.hours.some((h) => h.open)) facts.missing.push("hours");
  if (!facts.business.phone) facts.missing.push("phone");
  if (!facts.business.area) facts.missing.push("location");
  if (facts.photos === 0) facts.missing.push("photos");
  if (!facts.business.about) facts.missing.push("about");
  return facts;
}
