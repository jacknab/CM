/**
 * POS layout registry.
 *
 * `getPosLayout(businessType)` is the single lookup the checkout sheet uses.
 * Swap its body for an API/DB fetch later without touching call sites.
 */
import type { PosLayout, PosButton } from "./types";
import { nailSalonPosLayout } from "./configs/nailSalon";
import { defaultPosLayout } from "./configs/default";

export type { PosLayout, PosButton, PosAction, PosActionType } from "./types";
export { resolvePosIcon, POS_ICONS } from "./iconMap";

/** Keyed by `locations.category`. Add a config file + entry per business type. */
const POS_LAYOUTS: Record<string, PosLayout> = {
  "Nail Salon": nailSalonPosLayout,
};

export function getPosLayout(businessType?: string | null): PosLayout {
  return (businessType && POS_LAYOUTS[businessType]) || defaultPosLayout;
}

/** True when a dedicated (non-fallback) layout exists for this business type. */
export function hasPosLayout(businessType?: string | null): boolean {
  return !!businessType && businessType in POS_LAYOUTS;
}

/**
 * The subset of a layout's actions to show in the phone POS action bar.
 * Flattens the top-level `buttons` plus one level of `submenu`, keeps those
 * flagged `mobile: true`, and de-dupes by id preserving authored order.
 * `submenu` buttons are returned as-is — the mobile bar opens them as a sheet.
 */
export function getMobilePosActions(layout: PosLayout): PosButton[] {
  const out: PosButton[] = [];
  const seen = new Set<string>();
  const consider = (b: PosButton | null) => {
    if (!b || seen.has(b.id)) return;
    if (b.mobile) { out.push(b); seen.add(b.id); }
  };
  for (const b of layout.buttons) {
    consider(b);
    if (b?.action.type === "submenu" && b.action.submenu) {
      for (const child of b.action.submenu) consider(child);
    }
  }
  for (const b of layout.keypadButtons ?? []) {
    consider(b);
    if (b?.action.type === "submenu" && b.action.submenu) {
      for (const child of b.action.submenu) consider(child);
    }
  }
  return out;
}

/**
 * The subset of a layout's top-level actions to show in the desktop
 * checkout's bottom action-tile strip (rendered alongside the category/
 * service grid). Keeps those flagged `desktopTile: true`, de-duped by id,
 * preserving authored order. Only looks at `layout.buttons` — the
 * `keypadButtons` row (Tip Adjust/Discount/No Sale/Reprint on the nail-salon
 * layout) already has its own dedicated spot next to the numpad and isn't
 * duplicated here.
 */
export function getDesktopTileActions(layout: PosLayout): PosButton[] {
  const out: PosButton[] = [];
  const seen = new Set<string>();
  for (const b of layout.buttons) {
    if (!b || seen.has(b.id) || !b.desktopTile) continue;
    out.push(b);
    seen.add(b.id);
  }
  return out;
}
