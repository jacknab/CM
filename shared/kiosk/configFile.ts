/**
 * Kiosk configuration files (plans/kiosk-builder.md): a kiosk design saved to a file, to keep, share or load into
 * another business.
 *
 * The file holds the layout and the names of the services and add-ons its buttons and tap spots use — nothing
 * about clients and nothing private about the business. Service and add-on ids belong to one business, so on
 * import every button and tap spot is matched to the importing business's own catalog by name (and category,
 * when two services share a name). Anything with no match is left out and listed, so the owner can fix it.
 */

import { normalizeKioskLayout, type KioskLayout } from "./layout";
import type { BusinessTypeKey } from "./businessTypes";

export const KIOSK_CONFIG_FORMAT = "certxa-kiosk-config";
export const KIOSK_CONFIG_FORMAT_VERSION = 1;
export const KIOSK_CONFIG_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const KIOSK_CONFIG_NAME_MAX = 60;

export interface CatalogRef { id: number; name: string; category?: string | null }

export interface KioskConfigFile {
  format: typeof KIOSK_CONFIG_FORMAT;
  formatVersion: number;
  name: string;
  exportedAt: string;
  businessType: BusinessTypeKey;
  layout: KioskLayout;
  /** The services and add-ons the layout uses, by the exporting business's ids. */
  catalog: { services: CatalogRef[]; addons: CatalogRef[] };
}

export const cleanConfigName = (v: unknown) =>
  (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "").slice(0, KIOSK_CONFIG_NAME_MAX);

/** Every service and add-on id a layout uses. */
export function layoutCatalogIds(layout: KioskLayout): { services: Set<number>; addons: Set<number> } {
  const services = new Set<number>(), addons = new Set<number>();
  for (const m of layout.menus) {
    for (const t of m.tiles) if (t?.kind === "service" && t.serviceId) services.add(t.serviceId);
    for (const sp of m.spots) {
      if (sp.action.kind === "service") services.add(sp.action.serviceId);
      if (sp.action.kind === "addon") addons.add(sp.action.addonId);
    }
  }
  return { services, addons };
}

/** The file for a layout. `catalog`: the business's services and add-ons (only the ones used are written). */
export function buildKioskConfigFile(name: string, layout: KioskLayout, catalog: { services: CatalogRef[]; addons: CatalogRef[] }, now = new Date()): KioskConfigFile {
  const used = layoutCatalogIds(layout);
  const pick = (list: CatalogRef[], ids: Set<number>) =>
    list.filter((x) => ids.has(x.id)).map((x) => ({ id: x.id, name: x.name, ...(x.category ? { category: x.category } : {}) }));
  return {
    format: KIOSK_CONFIG_FORMAT,
    formatVersion: KIOSK_CONFIG_FORMAT_VERSION,
    name: cleanConfigName(name) || "Kiosk configuration",
    exportedAt: now.toISOString(),
    businessType: layout.preset,
    layout,
    catalog: { services: pick(catalog.services, used.services), addons: pick(catalog.addons, used.addons) },
  };
}

/** A file's contents → the file, or why it can't be used. */
export function parseKioskConfigFile(raw: unknown): { ok: true; file: KioskConfigFile } | { ok: false; error: string } {
  const r = raw as any;
  if (!r || typeof r !== "object" || r.format !== KIOSK_CONFIG_FORMAT) return { ok: false, error: "This isn't a Certxa kiosk configuration file." };
  if (!Number.isInteger(r.formatVersion) || r.formatVersion > KIOSK_CONFIG_FORMAT_VERSION) {
    return { ok: false, error: "This file was made by a newer version of Certxa. Refresh the page and try again." };
  }
  if (!r.layout || typeof r.layout !== "object") return { ok: false, error: "The file has no kiosk design in it." };
  const refs = (v: unknown): CatalogRef[] => (Array.isArray(v) ? v : [])
    .filter((x: any) => x && Number.isInteger(Number(x.id)) && typeof x.name === "string" && x.name.trim())
    .map((x: any) => ({ id: Number(x.id), name: String(x.name).trim().slice(0, 200), category: typeof x.category === "string" ? x.category.trim().slice(0, 200) : null }));
  const layout = normalizeKioskLayout(r.layout, "other");
  return {
    ok: true,
    file: {
      format: KIOSK_CONFIG_FORMAT, formatVersion: r.formatVersion,
      name: cleanConfigName(r.name) || "Imported kiosk configuration",
      exportedAt: typeof r.exportedAt === "string" ? r.exportedAt : "",
      businessType: layout.preset, layout,
      catalog: { services: refs(r.catalog?.services), addons: refs(r.catalog?.addons) },
    },
  };
}

const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** For each id in the file's catalog, the importing business's id with the same name (and category, to settle a tie). */
function matchIds(from: CatalogRef[], to: CatalogRef[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of from) {
    const same = to.filter((t) => key(t.name) === key(f.name));
    const best = same.find((t) => key(t.category) === key(f.category)) ?? same[0];
    if (best) out.set(f.id, best.id);
  }
  return out;
}

/**
 * A file's layout with its buttons and tap spots pointed at the importing business's catalog. Buttons and spots
 * with no match are left out; `unmatched` names them.
 */
export function remapKioskLayout(file: KioskConfigFile, own: { services: CatalogRef[]; addons: CatalogRef[] }):
  { layout: KioskLayout; unmatched: { services: string[]; addons: string[] } } {
  const svc = matchIds(file.catalog.services, own.services);
  const add = matchIds(file.catalog.addons, own.addons);
  const nameOf = (list: CatalogRef[], id: number) => list.find((x) => x.id === id)?.name ?? `#${id}`;
  const missS = new Set<string>(), missA = new Set<string>();
  const layout = structuredClone(file.layout);
  for (const m of layout.menus) {
    m.tiles = m.tiles.map((t) => {
      if (t?.kind !== "service" || t.serviceId == null) return t;
      const to = svc.get(t.serviceId);
      if (to == null) { missS.add(nameOf(file.catalog.services, t.serviceId)); return null; }
      return { ...t, serviceId: to };
    });
    m.spots = m.spots.flatMap((sp) => {
      const a = sp.action;
      if (a.kind === "service") {
        const to = svc.get(a.serviceId);
        if (to == null) { missS.add(nameOf(file.catalog.services, a.serviceId)); return []; }
        return [{ ...sp, action: { ...a, serviceId: to } }];
      }
      if (a.kind === "addon") {
        const to = add.get(a.addonId);
        if (to == null) { missA.add(nameOf(file.catalog.addons, a.addonId)); return []; }
        return [{ ...sp, action: { ...a, addonId: to } }];
      }
      return [sp];
    });
  }
  return { layout: normalizeKioskLayout(layout, file.layout.preset), unmatched: { services: [...missS], addons: [...missA] } };
}
