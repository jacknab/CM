/**
 * Pricing levels — barbershops and hair salons only (owner, 2026-11-02; migration 0289).
 *
 * A professional's price for a service, in this order:
 *   1. their own price for it (staff_services.price_override)
 *   2. their level's price for it (service_level_prices, via staff.pricing_level_id)
 *   3. the service's standard price (services.price) — and when they ARE on a level that has no price for it, the
 *      owner is told it is missing (missingPrices), so a blank is never mistaken for a set price.
 *
 * Nail salons (and any business that sets no levels) never reach this file: usesPricingLevels() is false for them,
 * and with no levels every price is the service's standard price — exactly as before.
 */
import { pool } from "../db";

/** The business types that price by professional. */
export function usesPricingLevels(category: string | null | undefined): boolean {
  return /barber|hair/i.test(category ?? "");
}

export interface PricingLevel { id: number; name: string; description: string | null; sortOrder: number; active: boolean }

export type PriceSource = "override" | "level" | "standard";
export interface QuotedPrice {
  serviceId: number;
  price: number;
  source: PriceSource;
  /** The level the price came from, kept with the appointment. */
  levelId: number | null;
  levelName: string | null;
  /** On a level that has no price for this service: the standard price is used and the owner is told. */
  missing: boolean;
}

const money = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;

/** The price rule itself: their own price, else their level's, else the service's standard price. */
export function pickPrice(serviceId: number, r: { standard: unknown; override: unknown; levelPrice: unknown; levelId: number | null; levelName: string | null }): QuotedPrice {
  const { levelId, levelName } = r;
  if (r.override != null) return { serviceId, price: money(r.override), source: "override", levelId, levelName, missing: false };
  if (r.levelPrice != null) return { serviceId, price: money(r.levelPrice), source: "level", levelId, levelName, missing: false };
  // On a level with no price for this service: the standard price, flagged so the owner is told (never a silent blank).
  return { serviceId, price: money(r.standard), source: "standard", levelId, levelName, missing: levelId != null };
}

/** One professional's prices for some services (only services that exist in this store). */
export async function quotePrices(storeId: number, staffId: number | null, serviceIds: number[]): Promise<Map<number, QuotedPrice>> {
  const out = new Map<number, QuotedPrice>();
  const ids = [...new Set(serviceIds.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return out;
  const { rows } = await pool.query(
    `SELECT s.id AS service_id, s.price AS standard,
            ss.price_override,
            pl.id AS level_id, pl.name AS level_name,
            slp.price AS level_price
       FROM services s
       LEFT JOIN staff st ON st.id = $2 AND st.store_id = s.store_id
       LEFT JOIN pricing_levels pl ON pl.id = st.pricing_level_id AND pl.is_active
       LEFT JOIN staff_services ss ON ss.staff_id = st.id AND ss.service_id = s.id
       LEFT JOIN service_level_prices slp ON slp.service_id = s.id AND slp.pricing_level_id = pl.id
      WHERE s.store_id = $1 AND s.id = ANY($3::int[])`,
    [storeId, staffId, ids],
  );
  for (const r of rows) {
    out.set(Number(r.service_id), pickPrice(Number(r.service_id), {
      standard: r.standard, override: r.price_override, levelPrice: r.level_price,
      levelId: r.level_id != null ? Number(r.level_id) : null, levelName: r.level_name ?? null,
    }));
  }
  return out;
}

/** Every bookable professional's prices for every active service: for price ranges and the booking page. */
export async function priceTable(storeId: number): Promise<{
  staff: { id: number; name: string; avatarUrl: string | null; levelId: number | null; levelName: string | null }[];
  prices: { staffId: number; serviceId: number; price: number }[];
}> {
  const staffRows = (await pool.query(
    `SELECT st.id, st.name, COALESCE(st.avatar_thumb_url, st.avatar_url) AS avatar_url, pl.id AS level_id, pl.name AS level_name
       FROM staff st LEFT JOIN pricing_levels pl ON pl.id = st.pricing_level_id AND pl.is_active
      WHERE st.store_id = $1 AND COALESCE(st.status, 'active') NOT IN ('removed', 'deactivated') AND st.show_on_calendar IS NOT FALSE
      ORDER BY pl.sort_order NULLS FIRST, st.name`,
    [storeId],
  )).rows;
  const { rows } = await pool.query(
    `SELECT ss.staff_id, s.id AS service_id, COALESCE(ss.price_override, slp.price, s.price) AS price
       FROM staff_services ss
       JOIN staff st ON st.id = ss.staff_id AND st.store_id = $1
       JOIN services s ON s.id = ss.service_id AND s.store_id = $1 AND s.is_active
       LEFT JOIN pricing_levels pl ON pl.id = st.pricing_level_id AND pl.is_active
       LEFT JOIN service_level_prices slp ON slp.service_id = s.id AND slp.pricing_level_id = pl.id
      WHERE COALESCE(st.status, 'active') NOT IN ('removed', 'deactivated') AND st.show_on_calendar IS NOT FALSE`,
    [storeId],
  );
  return {
    staff: staffRows.map((r: any) => ({ id: Number(r.id), name: r.name, avatarUrl: r.avatar_url ?? null, levelId: r.level_id != null ? Number(r.level_id) : null, levelName: r.level_name ?? null })),
    prices: rows.map((r: any) => ({ staffId: Number(r.staff_id), serviceId: Number(r.service_id), price: money(r.price) })),
  };
}

/** The lowest and highest price of each service across the professionals who do it. */
export function priceRanges(prices: { serviceId: number; price: number }[]): Map<number, { min: number; max: number }> {
  const out = new Map<number, { min: number; max: number }>();
  for (const p of prices) {
    const r = out.get(p.serviceId);
    if (!r) out.set(p.serviceId, { min: p.price, max: p.price });
    else { r.min = Math.min(r.min, p.price); r.max = Math.max(r.max, p.price); }
  }
  return out;
}

/** The owner's warning list: a professional on a level that has no price for a service they do. */
export async function missingPrices(storeId: number): Promise<{ staffId: number; staffName: string; levelName: string; serviceId: number; serviceName: string; standardPrice: number }[]> {
  const { rows } = await pool.query(
    `SELECT st.id AS staff_id, st.name AS staff_name, pl.name AS level_name, s.id AS service_id, s.name AS service_name, s.price
       FROM staff_services ss
       JOIN staff st ON st.id = ss.staff_id AND st.store_id = $1
       JOIN pricing_levels pl ON pl.id = st.pricing_level_id AND pl.is_active
       JOIN services s ON s.id = ss.service_id AND s.store_id = $1 AND s.is_active
       LEFT JOIN service_level_prices slp ON slp.service_id = s.id AND slp.pricing_level_id = pl.id
      WHERE ss.price_override IS NULL AND slp.price IS NULL AND COALESCE(st.status, 'active') NOT IN ('removed', 'deactivated')
      ORDER BY pl.sort_order, st.name, s.name`,
    [storeId],
  );
  return rows.map((r: any) => ({ staffId: Number(r.staff_id), staffName: r.staff_name, levelName: r.level_name, serviceId: Number(r.service_id), serviceName: r.service_name, standardPrice: money(r.price) }));
}

/** Keeps the price an appointment was given, and the level it came from, with the appointment. */
export async function savePriceOnAppointment(appointmentId: number, q: QuotedPrice): Promise<void> {
  await pool.query(
    `UPDATE appointments SET service_price = $2, pricing_level_id = $3, pricing_level_name = $4 WHERE id = $1`,
    [appointmentId, q.price.toFixed(2), q.levelId, q.levelName],
  );
}

/**
 * SQL for a front-desk ticket's service price (`a`: the appointment, `s`: its service). Every business but a
 * barbershop or hair salon: the catalog price, exactly as before. A barbershop or hair salon: the price kept with
 * the appointment (an online booking's quoted price), else the price of the professional the ticket is with — their
 * own, their level's, else the standard price — so a walk-in is charged at the level of whoever takes it and checks
 * it out. Aliases only, no values: safe to put in a query as it is.
 */
export function ticketServicePriceSQL(a = "a", s = "s"): string {
  return `(CASE WHEN (SELECT l.category FROM locations l WHERE l.id = ${a}.store_id) ~* '(barber|hair)' THEN COALESCE(${a}.service_price,
    (SELECT x.price_override FROM staff_services x WHERE x.staff_id = ${a}.staff_id AND x.service_id = ${a}.service_id ORDER BY x.price_override IS NULL LIMIT 1),
    (SELECT lp.price FROM staff lt JOIN pricing_levels lv ON lv.id = lt.pricing_level_id AND lv.is_active
       JOIN service_level_prices lp ON lp.pricing_level_id = lv.id AND lp.service_id = ${a}.service_id WHERE lt.id = ${a}.staff_id),
    ${s}.price) ELSE ${s}.price END)`;
}
