/**
 * Pure ticket maths for the nail-salon staff screen — no React, no fetching.
 * The server (lib/nailTickets.ts) recomputes everything authoritatively; this
 * only drives what the ticket panel shows while the ticket is being built.
 */

export type NailGroup = "size" | "shape" | "application" | "effect";

export interface NailOption {
  id: number;
  name: string;
  priceAdjustment: number;
  durationAdjustment: number;
  isDefault: boolean;
  /** Art priced by quote — costs nothing here, the salon prices it at checkout. */
  isQuote: boolean;
}

export interface NailConfigView {
  lengthRequired: boolean;
  shapeRequired: boolean;
  artRequired: boolean;
  sizes: NailOption[];
  shapes: NailOption[];
  applications: NailOption[];
  effects: NailOption[];
}

export interface NailPick {
  size: number | null;
  shape: number | null;
  application: number | null;
  effect: number | null;
}

export const EMPTY_PICK: NailPick = { size: null, shape: null, application: null, effect: null };

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

/** GET /api/services/:id/nail-config → only the enabled options, or null when the service has none. */
export function normalizeNailConfig(raw: any): NailConfigView | null {
  if (!raw || !raw.config || !raw.config.isEnabled) return null;
  const pick = (rows: any[] | undefined, idKey: string): NailOption[] =>
    (rows ?? [])
      .filter((r) => r.isEnabled !== false)
      .map((r) => ({
        id: r[idKey],
        name: r.name,
        priceAdjustment: num(r.priceAdjustment),
        durationAdjustment: num(r.durationAdjustment),
        isDefault: !!r.isDefault,
        isQuote: !!r.isQuote,
      }));
  const cfg: NailConfigView = {
    lengthRequired: !!raw.config.lengthRequired,
    shapeRequired: !!raw.config.shapeRequired,
    artRequired: !!raw.config.artRequired,
    sizes: pick(raw.sizes, "nailSizeId"),
    shapes: pick(raw.shapes, "nailShapeId"),
    applications: pick(raw.applications, "nailArtApplicationId"),
    effects: pick(raw.effects, "nailArtEffectId"),
  };
  const any = cfg.sizes.length + cfg.shapes.length + cfg.applications.length + cfg.effects.length;
  return any > 0 ? cfg : null;
}

export function defaultPick(cfg: NailConfigView | null): NailPick {
  if (!cfg) return { ...EMPTY_PICK };
  const d = (rows: NailOption[]) => rows.find((r) => r.isDefault)?.id ?? null;
  return { size: d(cfg.sizes), shape: d(cfg.shapes), application: null, effect: null };
}

const optionsFor = (cfg: NailConfigView, group: NailGroup) =>
  group === "size" ? cfg.sizes : group === "shape" ? cfg.shapes : group === "application" ? cfg.applications : cfg.effects;

export interface TicketLine {
  key: string;
  kind: "service" | "addon" | "nail" | "custom";
  label: string;
  duration: number;
  price: number;
  /** Set on nail lines so removing one clears that group. */
  group?: NailGroup;
  /** Set on add-on lines. */
  addonId?: number;
  /** Set on keypad "Custom Amount" lines — their id in the draft. */
  customId?: number;
  note?: string;
}

export interface NailAdjustment {
  price: number;
  duration: number;
  lines: TicketLine[];
}

const GROUP_LABEL: Record<NailGroup, string> = { size: "Length", shape: "Shape", application: "Art", effect: "Effect" };

export function nailAdjustment(cfg: NailConfigView | null, pick: NailPick): NailAdjustment {
  const out: NailAdjustment = { price: 0, duration: 0, lines: [] };
  if (!cfg) return out;
  (["size", "shape", "application", "effect"] as NailGroup[]).forEach((group) => {
    const id = pick[group];
    if (id == null) return;
    const opt = optionsFor(cfg, group).find((o) => o.id === id);
    if (!opt) return;
    // Quote-priced art (an application) is priced at checkout, so it adds no money here.
    const price = group === "application" && opt.isQuote ? 0 : opt.priceAdjustment;
    out.price += price;
    out.duration += opt.durationAdjustment;
    out.lines.push({
      key: `nail-${group}`,
      kind: "nail",
      label: `${GROUP_LABEL[group]}: ${opt.name}`,
      duration: opt.durationAdjustment,
      price,
      group,
      note: group === "application" && opt.isQuote ? "Custom quote" : undefined,
    });
  });
  return out;
}

export interface DraftService {
  id: number;
  name: string;
  duration: number;
  price: number | string;
}
export interface DraftAddon {
  id: number;
  name: string;
  duration: number | null;
  price: number | string;
}

export interface DraftTotals {
  lines: TicketLine[];
  duration: number;
  price: number;
}

/** A keypad "Custom Amount" line while the ticket is being built. */
export interface DraftCustomLine {
  id: number;
  label: string;
  price: number;
}

export function draftTotals(
  service: DraftService | null,
  addonIds: number[],
  addons: DraftAddon[],
  cfg: NailConfigView | null,
  pick: NailPick,
  custom: DraftCustomLine[] = [],
): DraftTotals {
  const lines: TicketLine[] = [];
  if (service) {
    lines.push({ key: `svc-${service.id}`, kind: "service", label: service.name, duration: num(service.duration), price: num(service.price) });
    for (const id of addonIds) {
      const a = addons.find((x) => x.id === id);
      if (a) lines.push({ key: `addon-${a.id}`, kind: "addon", label: a.name, duration: num(a.duration), price: num(a.price), addonId: a.id });
    }
    lines.push(...nailAdjustment(cfg, pick).lines);
  }
  for (const c of custom) {
    lines.push({ key: `custom-${c.id}`, kind: "custom", label: c.label, duration: 0, price: c.price, customId: c.id });
  }
  return {
    lines,
    duration: lines.reduce((s, l) => s + l.duration, 0),
    price: Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100,
  };
}

/** Keypad entry → dollars ("12", "12.5"); null when it isn't a positive amount. */
export function parseKeypadAmount(display: string): number | null {
  const n = Number(display);
  if (!display || !Number.isFinite(n) || n <= 0 || n > 9999.99) return null;
  return Math.round(n * 100) / 100;
}

/** Body for POST/PUT /api/nail/tickets — null when nothing nail-specific was chosen. */
export function toNailBody(pick: NailPick) {
  if (pick.size == null && pick.shape == null && pick.application == null && pick.effect == null) return null;
  return {
    nailSizeId: pick.size,
    nailShapeId: pick.shape,
    nailArtApplicationId: pick.application,
    nailArtEffectId: pick.effect,
  };
}

export function formatDuration(totalMinutes: number): string {
  if (!totalMinutes) return "0 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/** "5 min ago", "1 hr 5 min ago" — for the waiting / in-service timers. */
export function formatElapsed(fromIso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} hr ${minutes % 60} min`;
}
