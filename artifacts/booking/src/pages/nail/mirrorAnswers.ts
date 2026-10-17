/**
 * Offline answers from the salon's full copy on the tablet (lib/salon-mirror.ts, plans/salon-local-database.md).
 *
 * Every /nail read keeps the server's last answer on the tablet and gives it back offline (nailApi `call`). That
 * covers what was opened while online; a read the tablet never made — a client nobody opened today, a service's
 * nail options nobody picked yet, the upcoming list — has no kept answer. These are built here from the copy, in
 * the same shape the server sends. Rows in the copy are as the server stores them (snake_case).
 */
import { hasSalonMirror, mirrorAll, mirrorFind, mirrorGet } from "@/lib/salon-mirror";

const digits10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

/** A client as the online client lookup returns them (/api/customers/search, /api/customers/:id). */
export async function mirrorClient(storeId: number, id: number): Promise<any | null> {
  const c = await mirrorGet(storeId, "clients", id);
  if (!c || c.archived_at) return null;
  const [phones, emails] = await Promise.all([
    mirrorFind(storeId, "client_phones", "client_id", id),
    mirrorFind(storeId, "client_emails", "client_id", id),
  ]);
  const phone = phones.find((p) => p.is_primary) ?? phones[0];
  const email = emails.find((e) => e.is_primary) ?? emails[0];
  return {
    id, name: c.full_name, fullName: c.full_name, phone: phone?.display_phone ?? phone?.phone_number_e164 ?? null,
    email: email?.email_address ?? null, loyaltyPoints: num(c.loyalty_points), allergies: c.allergies ?? null,
    birthday: c.date_of_birth ?? null, storeId,
  };
}

/** The client with this 10-digit number, or null. */
export async function mirrorClientIdByPhone(storeId: number, phone: string): Promise<number | null> {
  const want = digits10(phone);
  if (want.length !== 10) return null;
  for (const p of await mirrorAll(storeId, "client_phones")) {
    if (digits10(p.phone_number_e164) !== want && digits10(p.display_phone) !== want) continue;
    const c = await mirrorGet(storeId, "clients", p.client_id);
    if (c && !c.archived_at) return Number(c.id);
  }
  return null;
}

/** A service's nail options, as GET /api/services/:id/nail-config returns them. */
async function mirrorNailConfig(storeId: number, serviceId: number): Promise<any | null> {
  const [config] = await mirrorFind(storeId, "nail_service_configs", "service_id", serviceId, 1);
  if (!config) return null;
  const options = async (link: string, optionTable: string, idField: string, idKey: string, extra: (o: any) => object) => {
    const rows = await mirrorFind(storeId, link, "service_id", serviceId);
    const out = await Promise.all(rows.map(async (r) => {
      const o = await mirrorGet(storeId, optionTable, r[idField]);
      if (!o) return null;
      return {
        id: r.id, [idKey]: r[idField], name: o.name, priceAdjustment: r.price_adjustment, durationAdjustment: r.duration_adjustment,
        isDefault: !!r.is_default, isEnabled: r.is_enabled !== false, sortOrder: r.sort_order ?? 0, ...extra(o),
      };
    }));
    return out.filter(Boolean).sort((a: any, b: any) => a.sortOrder - b.sortOrder || a.id - b.id);
  };
  const [sizes, shapes, applications, effects] = await Promise.all([
    options("service_nail_sizes", "nail_sizes", "nail_size_id", "nailSizeId", (o) => ({ description: o.description, imageUrl: o.image_url })),
    options("service_nail_shapes", "nail_shapes", "nail_shape_id", "nailShapeId", (o) => ({ description: o.description, imageUrl: o.image_url })),
    options("service_nail_art_applications", "nail_art_applications", "nail_art_application_id", "nailArtApplicationId", (o) => ({ isQuote: !!o.is_quote })),
    options("service_nail_art_effects", "nail_art_effects", "nail_art_effect_id", "nailArtEffectId", (o) => ({ description: o.description, imageUrl: o.image_url, swatchHex: o.swatch_hex })),
  ]);
  return {
    config: { id: config.id, serviceId, isEnabled: !!config.is_enabled, lengthRequired: !!config.length_required,
      shapeRequired: !!config.shape_required, artRequired: !!config.art_required },
    sizes, shapes, applications, effects,
  };
}

/** Booked visits still to come, as GET /api/nail/upcoming returns them (the next 90 days, not walk-ins). */
async function mirrorUpcoming(storeId: number): Promise<any[]> {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const until = Date.now() + 90 * 86_400_000;
  const near = (a: unknown, b: unknown) => a != null && b != null && Math.abs(Date.parse(String(a)) - Date.parse(String(b))) < 900_000;
  const rows = (await mirrorAll(storeId, "appointments")).filter((a) =>
    ["pending", "confirmed"].includes(String(a.status)) && !a.checked_in_at
    && Date.parse(a.date) >= startOfToday.getTime() && Date.parse(a.date) < until
    // Not a walk-in: made at its own time, or checked in within minutes of being made.
    && !near(a.created_at, a.date));
  rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || Number(a.id) - Number(b.id));
  const name = async (tbl: string, id: unknown) => (id == null ? null : (await mirrorGet(storeId, tbl, id as number))?.[tbl === "clients" ? "full_name" : "name"] ?? null);
  return Promise.all(rows.slice(0, 300).map(async (a) => ({
    id: Number(a.id), ticketNumber: a.ticket_number ?? null, date: new Date(a.date).toISOString(), duration: num(a.duration),
    status: a.status, clientName: (await name("clients", a.customer_id)) ?? "Guest", serviceName: (await name("services", a.service_id)) ?? "Service",
    staffName: await name("staff", a.staff_id), isWalkIn: false,
  })));
}

/** An answer for `url` built from the copy, or undefined when it isn't one of these reads (or there is no copy). */
export async function answerFromMirror(storeId: number, url: string): Promise<unknown | undefined> {
  if (!(await hasSalonMirror(storeId).catch(() => false))) return undefined;
  const path = url.split("?")[0];
  let m: RegExpMatchArray | null;
  try {
    if ((m = path.match(/^\/api\/customers\/(\d+)$/))) return (await mirrorClient(storeId, Number(m[1]))) ?? undefined;
    if ((m = path.match(/^\/api\/services\/(\d+)\/nail-config$/))) return await mirrorNailConfig(storeId, Number(m[1]));
    if (path === "/api/nail/upcoming") return await mirrorUpcoming(storeId);
  } catch {
    return undefined;
  }
  return undefined;
}
