/**
 * The POS key grid a manager arranges (the right panel of the /nail ticket builder): which key sits in
 * each of the 18 positions of the main grid and of any extra grids they make. No saved layout means the
 * grid is filled automatically from the catalog (categories, then each category's services).
 *
 * Shared by the server (what may be saved) and the screen (what is drawn).
 */

export const POS_GRID_COLUMNS = 3;
export const POS_GRID_SLOTS = POS_GRID_COLUMNS * 6;
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
  /** Puts that service on the ticket. */
  | ({ type: "service"; serviceId: number } & KeyLook)
  /** Opens another grid the manager made. */
  | ({ type: "grid"; gridId: string } & KeyLook)
  /** Goes back to the grid it was opened from. */
  | ({ type: "back" } & KeyLook);

export interface PosGrid { id: string; name: string; keys: (PosKey | null)[] }
/** `grids[0]` is always the main grid. */
export interface PosGridConfig { grids: PosGrid[] }

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
  for (const grid of ordered) {
    const keys: (PosKey | null)[] = [];
    for (let i = 0; i < POS_GRID_SLOTS; i++) {
      const k: any = grid.keys[i];
      if (k?.type === "category" && typeof k.groupKey === "string" && k.groupKey.length > 0 && k.groupKey.length <= 120) keys.push({ type: "category", groupKey: k.groupKey, ...look(k) });
      else if (k?.type === "service" && Number.isSafeInteger(Number(k.serviceId)) && Number(k.serviceId) > 0) keys.push({ type: "service", serviceId: Number(k.serviceId), ...look(k) });
      else if (k?.type === "grid" && typeof k.gridId === "string" && ids.has(k.gridId) && k.gridId !== grid.id && k.gridId !== POS_GRID_MAIN) keys.push({ type: "grid", gridId: k.gridId, ...look(k) });
      else if (k?.type === "back" && grid.id !== POS_GRID_MAIN) keys.push({ type: "back", ...look(k) });
      else keys.push(null);
    }
    grid.keys = keys;
  }
  return { grids: ordered };
}
