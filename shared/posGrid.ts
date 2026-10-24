/**
 * The POS key grid a manager arranges (the right panel of the /nail ticket builder): which key sits in
 * each of the 12 positions (2 × 6; 3 × 6 until 2026-10-17 — a saved layout keeps its first 12) of the main grid and of any extra grids they make. No saved layout means the
 * grid is filled automatically from the catalog (categories, then each category's services).
 *
 * Shared by the server (what may be saved) and the screen (what is drawn).
 */

export const POS_GRID_COLUMNS = 2;
export const POS_GRID_ROWS = 6;
export const POS_GRID_SLOTS = POS_GRID_COLUMNS * POS_GRID_ROWS;
/** A salon may choose 3 across (18 keys) instead of 2 (owner, 2026-10-24). */
export type PosGridColumns = 2 | 3;
export const posGridColumns = (config: PosGridConfig | null | undefined): PosGridColumns => (config?.columns === 3 ? 3 : 2);
export const posGridSlots = (config: PosGridConfig | null | undefined) => posGridColumns(config) * POS_GRID_ROWS;
export const POS_GRID_MAIN = "main";
export const POS_GRID_MAX_GRIDS = 20;

interface KeyLook {
  /** Shown instead of the category / service / grid's own name. */
  label?: string;
  /** The band along the bottom of the key, "#rrggbb". Without one the key takes its row's colour. */
  color?: string;
}

export type PosKey =
  /** Opens that catalog category's services. `groupKey` is the catalog group's key ("cat:12"). */
  | ({ type: "category"; groupKey: string } & KeyLook)
  /** Puts that service on the ticket. A negative id is a Catalog package (its id, negated). */
  | ({ type: "service"; serviceId: number } & KeyLook)
  /** Opens another grid the manager made. */
  | ({ type: "grid"; gridId: string } & KeyLook)
  /** Goes back to the grid it was opened from. */
  | ({ type: "back" } & KeyLook)
  /** Puts that add-on on the ticket (tap again to take it off while building the ticket). */
  | ({ type: "addon"; addonId: number } & KeyLook)
  /** Runs a POS function, the same as its button under the keypad. */
  | ({ type: "fn"; fn: PosFn } & KeyLook);

/** POS functions a key can run (owner, 2026-10-24). */
export const POS_FNS = ["discount", "giftcard", "nosale", "reprint"] as const;
export type PosFn = (typeof POS_FNS)[number];
export const POS_FN_LABELS: Record<PosFn, string> = { discount: "Discount", giftcard: "Gift Card", nosale: "No Sale", reprint: "Reprint Last" };

/** Where the POS goes after a service or add-on is picked on a grid: stay there, back to the main grid, or open a grid. */
export type PosAfter = { to: "stay" } | { to: "main" } | { to: "grid"; gridId: string };

export interface PosGrid { id: string; name: string; keys: (PosKey | null)[]; after?: PosAfter }
/** `grids[0]` is always the main grid. `afterService`: the same for a category's own grid of services. */
export interface PosGridConfig { grids: PosGrid[]; afterService?: PosAfter; /** 3 = three across (18 keys); omitted = two (12). */ columns?: 3 }

const GRID_ID = /^[a-z0-9_-]{1,24}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

function look(raw: any): KeyLook {
  const out: KeyLook = {};
  const label = typeof raw?.label === "string" ? raw.label.trim().slice(0, 28) : "";
  if (label) out.label = label;
  if (typeof raw?.color === "string" && COLOR.test(raw.color)) out.color = raw.color.toLowerCase();
  return out;
}

/** What may be saved: a clean copy of `raw`, or null when it isn't a usable layout (→ automatic). */
export function sanitizePosGridConfig(raw: unknown): PosGridConfig | null {
  const list = (raw as any)?.grids;
  if (!Array.isArray(list) || list.length === 0) return null;
  const ids = new Set<string>();
  const grids: PosGrid[] = [];
  for (const g of list.slice(0, POS_GRID_MAX_GRIDS)) {
    const id = typeof g?.id === "string" ? g.id : "";
    if (!GRID_ID.test(id) || ids.has(id)) continue;
    ids.add(id);
    grids.push({ id, name: (typeof g?.name === "string" ? g.name.trim().slice(0, 28) : "") || (id === POS_GRID_MAIN ? "Main" : "Grid"), keys: Array.isArray(g?.keys) ? g.keys : [] });
  }
  const main = grids.find((g) => g.id === POS_GRID_MAIN);
  if (!main) return null;
  const ordered = [main, ...grids.filter((g) => g !== main)];
  const columns: PosGridColumns = (raw as any)?.columns === 3 ? 3 : 2;
  const slots = columns * POS_GRID_ROWS;
  for (const grid of ordered) {
    const keys: (PosKey | null)[] = [];
    for (let i = 0; i < slots; i++) {
      const k: any = grid.keys[i];
      if (k?.type === "category" && typeof k.groupKey === "string" && k.groupKey.length > 0 && k.groupKey.length <= 120) keys.push({ type: "category", groupKey: k.groupKey, ...look(k) });
      else if (k?.type === "service" && Number.isSafeInteger(Number(k.serviceId)) && Number(k.serviceId) !== 0) keys.push({ type: "service", serviceId: Number(k.serviceId), ...look(k) });
      else if (k?.type === "grid" && typeof k.gridId === "string" && ids.has(k.gridId) && k.gridId !== grid.id && k.gridId !== POS_GRID_MAIN) keys.push({ type: "grid", gridId: k.gridId, ...look(k) });
      else if (k?.type === "back" && grid.id !== POS_GRID_MAIN) keys.push({ type: "back", ...look(k) });
      else if (k?.type === "addon" && Number.isSafeInteger(Number(k.addonId)) && Number(k.addonId) > 0) keys.push({ type: "addon", addonId: Number(k.addonId), ...look(k) });
      else if (k?.type === "fn" && (POS_FNS as readonly string[]).includes(k.fn)) keys.push({ type: "fn", fn: k.fn, ...look(k) });
      else keys.push(null);
    }
    grid.keys = keys;
    const after = sanitizeAfter((list.find((g: any) => g?.id === grid.id) as any)?.after, ids, grid.id);
    if (after) grid.after = after; else delete grid.after;
  }
  const afterService = sanitizeAfter((raw as any)?.afterService, ids, null);
  return { grids: ordered, ...(afterService ? { afterService } : {}), ...(columns === 3 ? { columns: 3 as const } : {}) };
}

/** A usable "after a selection" (a grid it jumps to must exist and not be itself); "stay" is the default, so it is dropped. */
function sanitizeAfter(raw: any, ids: Set<string>, self: string | null): PosAfter | undefined {
  if (raw?.to === "main") return { to: "main" };
  if (raw?.to === "grid" && typeof raw.gridId === "string" && ids.has(raw.gridId) && raw.gridId !== self && raw.gridId !== POS_GRID_MAIN) return { to: "grid", gridId: raw.gridId };
  return undefined;
}
