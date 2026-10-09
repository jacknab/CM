/**
 * Smart Check-In: what the kiosk suggests to a returning client.
 *
 * A rules engine, on purpose (no model decides a service): it reads the client's completed visits, works out
 * which kind of service each one was, and — when the time since that visit falls in the window where a
 * follow-up is usual — suggests it. Every number here is a default the salon can be given control over later;
 * none is a nail-care rule. The technician always assesses the actual nails.
 *
 * Only completed visits count. A cancelled booking, an open ticket, or a service merely picked at the kiosk
 * never moves the clock.
 */
import { pool } from "../db";

// ── What kind of service is this? ─────────────────────────────────────────────
// Worked out from the service's name and category, because the catalog has no such field yet.
export type ServiceFamily = "acrylic" | "gel" | "gelx" | "dip" | "polish" | "pedicure" | "other";
export type ServiceRole = "full_set" | "fill" | "removal" | "manicure" | "pedicure" | "other";
export interface ServiceKind { family: ServiceFamily; role: ServiceRole }

export function classifyService(name: string, category?: string | null): ServiceKind {
  const n = ` ${name} `.toLowerCase();
  const all = `${n} ${category ?? ""}`.toLowerCase();
  if (/remov|soak[\s-]?off|take[\s-]?off/.test(n)) return { family: "other", role: "removal" };
  if (/pedi/.test(all)) return { family: "pedicure", role: "pedicure" };

  let family: ServiceFamily = "other";
  if (/gel[\s-]?x\b|apr[eè]s|soft gel tips?/.test(all)) family = "gelx";
  else if (/acrylic|pink\s*(&|and|n)\s*white|\bp\s*&\s*w\b|solar/.test(all)) family = "acrylic";
  else if (/\bdip\b|dipping|\bsns\b/.test(all)) family = "dip";
  else if (/hard gel|builder|biab|gel (full )?set|gel fill|gel extension|gel nails/.test(all)) family = "gel";
  else if (/mani|polish|shellac|gel/.test(all)) family = "polish";
  if (family === "other") return { family, role: "other" };

  const enhancement = family === "acrylic" || family === "gel" || family === "gelx" || family === "dip";
  if (/\b(re)?fill\b|refill|in[\s-]?fill|back[\s-]?fill|rebalance|rebase/.test(n)) return { family, role: "fill" };
  if (/mani/.test(n) || family === "polish") return { family, role: "manicure" };
  // An enhancement that is neither a fill nor a manicure is a set ("Full Set Acrylics", "Gel X with Nail Art").
  return { family, role: enhancement ? "full_set" : "other" };
}

// ── Timing windows (days since the visit) ─────────────────────────────────────
const WINDOWS = {
  /** A set or fill → suggest a fill. */
  fill: { from: 10, to: 34 },
  /** Past the fill window: could be a fill or a new set — ask, don't assume. */
  fillOrSet: { from: 35, to: 60 },
  /** A manicure → the same manicure again. */
  manicure: { from: 10, to: 35 },
  /** A pedicure → the same pedicure again. */
  pedicure: { from: 21, to: 49 },
  /** Visits older than this say nothing about today. */
  lookback: 120,
} as const;

export interface VisitRow { serviceId: number; serviceName: string; category: string | null; daysAgo: number }
export interface CatalogService { id: number; name: string; category: string | null; price: number; duration: number }

export interface Recommendation {
  /** "refill": a fill after a set · "choice": fill or new set, the client decides · "again": the same service · "usual": what they most often have. */
  kind: "refill" | "choice" | "again" | "usual";
  /** The services offered, first = the primary one. All from the salon's current catalog. */
  serviceIds: number[];
  /** The visit the suggestion comes from. */
  basedOn: { serviceName: string; daysAgo: number };
  /** Internal only — never shown to the client. */
  score: number;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).map((w) => w.replace(/s$/, "")).filter((w) => w.length > 2 && !["full", "set", "fill", "refill", "new", "with", "and", "nail"].includes(w)));
/** Of several candidates, the one whose name shares most with `like` ("Pink & White Full Set" → "Pink & White Fill"). */
function closest(candidates: CatalogService[], like: string): CatalogService | undefined {
  const want = words(like);
  let best: CatalogService | undefined; let bestScore = -Infinity;
  for (const c of candidates) {
    let shared = 0;
    for (const w of words(c.name)) if (want.has(w)) shared += 1;
    // Fewest extra words breaks a tie, so plain "Acrylic Fill" beats "Acrylic Fill with Gel Polish".
    const score = shared * 10 - words(c.name).size;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

/** How central `days` is in a window: 35 at the middle, falling to 15 at either edge. */
function timeScore(days: number, w: { from: number; to: number }): number {
  const mid = (w.from + w.to) / 2;
  const half = (w.to - w.from) / 2 || 1;
  return Math.round(35 - 20 * Math.min(1, Math.abs(days - mid) / half));
}

/**
 * The one suggestion to make, or null. Pure — unit-tested.
 * `visits`: completed visits, newest first. `catalog`: the salon's active services.
 */
export function recommend(visits: VisitRow[], catalog: CatalogService[]): Recommendation | null {
  const recent = visits.filter((v) => v.daysAgo >= 0 && v.daysAgo <= WINDOWS.lookback);
  if (!recent.length) return null;
  const kinds = new Map(catalog.map((s) => [s.id, classifyService(s.name, s.category)]));
  const inCatalog = (id: number) => catalog.find((s) => s.id === id);
  const timesHad = (family: ServiceFamily) => recent.filter((v) => classifyService(v.serviceName, v.category).family === family).length;

  const candidates: Recommendation[] = [];
  const seenFamily = new Set<ServiceFamily>();
  for (const v of recent) {
    const kind = classifyService(v.serviceName, v.category);
    // Only the latest visit of each family speaks for it.
    if (kind.family === "other" || seenFamily.has(kind.family)) continue;
    seenFamily.add(kind.family);
    const basedOn = { serviceName: v.serviceName, daysAgo: v.daysAgo };
    const history = Math.min(20, timesHad(kind.family) * 5);
    const enhancement = kind.role === "full_set" || kind.role === "fill";

    if (enhancement) {
      const fills = catalog.filter((s) => { const k = kinds.get(s.id)!; return k.family === kind.family && k.role === "fill"; });
      const sets = catalog.filter((s) => { const k = kinds.get(s.id)!; return k.family === kind.family && k.role === "full_set"; });
      const fill = closest(fills, v.serviceName);
      const set = kind.role === "full_set" ? inCatalog(v.serviceId) ?? closest(sets, v.serviceName) : closest(sets, v.serviceName);
      if (fill && v.daysAgo >= WINDOWS.fill.from && v.daysAgo <= WINDOWS.fill.to) {
        candidates.push({ kind: "refill", serviceIds: [fill.id], basedOn, score: timeScore(v.daysAgo, WINDOWS.fill) + 25 + history + 10 });
      } else if (v.daysAgo >= WINDOWS.fillOrSet.from && v.daysAgo <= WINDOWS.fillOrSet.to && (fill || set)) {
        const ids = [fill?.id, set?.id].filter((x): x is number => x != null);
        candidates.push({ kind: ids.length > 1 ? "choice" : "again", serviceIds: ids, basedOn, score: timeScore(v.daysAgo, WINDOWS.fillOrSet) + 15 + history });
      }
      continue;
    }
    const again = inCatalog(v.serviceId);
    const w = kind.role === "pedicure" ? WINDOWS.pedicure : kind.role === "manicure" ? WINDOWS.manicure : null;
    if (again && w && v.daysAgo >= w.from && v.daysAgo <= w.to) {
      candidates.push({ kind: "again", serviceIds: [again.id], basedOn, score: timeScore(v.daysAgo, w) + 20 + history });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0] && candidates[0].score >= 40) return candidates[0];

  // Nothing is "due": fall back to what this client usually has — the same service on most of their recent visits.
  const lastFive = recent.slice(0, 5);
  const counts = new Map<number, number>();
  for (const v of lastFive) counts.set(v.serviceId, (counts.get(v.serviceId) ?? 0) + 1);
  const [usualId, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const usual = usualId != null ? inCatalog(usualId) : undefined;
  if (usual && n >= 2 && classifyService(usual.name, usual.category).role !== "removal") {
    const v = recent.find((x) => x.serviceId === usualId)!;
    return { kind: "usual", serviceIds: [usual.id], basedOn: { serviceName: v.serviceName, daysAgo: v.daysAgo }, score: 30 + n * 5 };
  }
  return null;
}

// ── Reading the client's history ──────────────────────────────────────────────
export interface SmartCheckin {
  lastVisit: { serviceName: string; daysAgo: number } | null;
  recommendation: Omit<Recommendation, "score"> | null;
  /** Add-ons this client has had before, most often first — the kiosk suggests the first one today's service offers. */
  addonIds: number[];
}

export async function smartCheckinFor(storeId: number, clientId: number, timezone: string): Promise<SmartCheckin> {
  const [visitRows, catalogRows, addonRows] = await Promise.all([
    pool.query(
      `SELECT a.service_id, s.name, s.category,
              ((NOW() AT TIME ZONE $3)::date - (COALESCE(a.completed_at, a.date) AT TIME ZONE $3)::date) AS days_ago
         FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.store_id = $1 AND a.customer_id = $2 AND a.status = 'completed'
        ORDER BY COALESCE(a.completed_at, a.date) DESC
        LIMIT 40`,
      [storeId, clientId, timezone],
    ),
    pool.query(`SELECT id, name, category, price::float AS price, duration FROM services WHERE store_id = $1 AND is_active = true`, [storeId]),
    pool.query(
      `SELECT aa.addon_id, COUNT(*) AS n, MAX(COALESCE(a.completed_at, a.date)) AS last
         FROM appointment_addons aa
         JOIN appointments a ON a.id = aa.appointment_id
         JOIN addons ad ON ad.id = aa.addon_id AND ad.is_active = true
        WHERE a.store_id = $1 AND a.customer_id = $2 AND a.status = 'completed'
        GROUP BY aa.addon_id ORDER BY n DESC, last DESC LIMIT 5`,
      [storeId, clientId],
    ),
  ]);
  const visits: VisitRow[] = visitRows.rows.map((r: any) => ({ serviceId: Number(r.service_id), serviceName: String(r.name), category: r.category ?? null, daysAgo: Number(r.days_ago) }));
  const catalog: CatalogService[] = catalogRows.rows.map((r: any) => ({ id: Number(r.id), name: String(r.name), category: r.category ?? null, price: Number(r.price), duration: Number(r.duration) }));
  const rec = recommend(visits, catalog);
  return {
    lastVisit: visits[0] ? { serviceName: visits[0].serviceName, daysAgo: visits[0].daysAgo } : null,
    recommendation: rec ? { kind: rec.kind, serviceIds: rec.serviceIds, basedOn: rec.basedOn } : null,
    addonIds: addonRows.rows.map((r: any) => Number(r.addon_id)),
  };
}

// ── What was offered, and what came of it ─────────────────────────────────────
export interface OfferReport { kind: "service" | "addon"; itemId: number; accepted: boolean }

/** The offers made during one check-in, recorded against the ticket it produced (so paid tickets can be measured). */
export async function recordOffers(storeId: number, clientId: number | null, appointmentId: number | null, raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return;
  const offers: OfferReport[] = [];
  for (const o of raw.slice(0, 12) as any[]) {
    const itemId = Number(o?.itemId);
    if ((o?.kind === "service" || o?.kind === "addon") && Number.isInteger(itemId)) offers.push({ kind: o.kind, itemId, accepted: o.accepted === true });
  }
  for (const o of offers) {
    await pool.query(
      `INSERT INTO kiosk_recommendation_events (store_id, client_id, appointment_id, kind, item_id, accepted) VALUES ($1,$2,$3,$4,$5,$6)`,
      [storeId, clientId, appointmentId, o.kind, o.itemId, o.accepted],
    );
  }
}
