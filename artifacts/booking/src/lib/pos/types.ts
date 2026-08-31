/**
 * POS function-button model.
 *
 * The checkout keypad's right-hand grid of function buttons is data-driven and
 * varies by the store's business type (`locations.category`). A nail salon needs
 * different POS actions than a barbershop, so each business type supplies its own
 * `PosLayout`. Layouts live in `configs/` today; a future admin UI can persist
 * them per-store and this module's `getPosLayout()` becomes the only thing that
 * needs to change.
 *
 * Buttons can nest: an `action.type === "submenu"` button swaps the grid for its
 * `submenu` buttons (with a Back affordance). Submenus can nest arbitrarily.
 */

/** Every discrete thing a POS function button can trigger. Extend as features land. */
export type PosActionType =
  | "submenu"            // replace the grid with action.submenu
  | "back"               // pop one submenu level (auto-injected; not authored)
  | "addon-browser"      // open the store's live add-on catalogue, paginated to fit the grid
  | "guided-ticket"      // step the tech through amount prompts (payload.steps), one cart line each
  | "add-service"        // add a predefined service line (payload.serviceId | serviceName)
  | "add-product"        // open retail product picker (payload.categoryId?)
  | "add-custom-item"    // add an ad-hoc line item priced from the keypad
  | "add-addon"          // add a service add-on (payload.addonId | addonName, price?)
  | "discount-preset"    // apply a fixed discount (payload.percent | payload.amount)
  | "discount-custom"    // open discount entry, seeded from the keypad value
  | "comp-item"          // 100% comp the ticket / a line
  | "gift-card"          // payload.mode: "sell" | "redeem" | "balance"
  | "membership"         // payload.mode: "sell" | "apply"
  | "link-tickets"       // group pay — attach other active tickets to this one
  | "loyalty-redeem"     // redeem loyalty points/rewards
  | "tip-adjust"         // open tip editor
  | "no-sale"            // open the cash drawer, no transaction
  | "cash-drop"          // record a paid-in / paid-out
  | "reprint-receipt"    // payload.which: "last" | "select" | "gift"
  | "noop";              // placeholder — button renders but does nothing yet

export interface PosAction {
  type: PosActionType;
  /** Present when `type === "submenu"`. */
  submenu?: PosButton[];
  /** Action-specific data (percent, serviceId, mode, …). */
  payload?: Record<string, unknown>;
}

export interface PosButton {
  /** Stable identifier, namespaced by business type, e.g. "nail.addon.gel". */
  id: string;
  /** Button caption. `\n` forces a line break. */
  label: string;
  /** Lucide icon name — resolved through `iconMap.ts`. Unknown names fall back to a dot. */
  icon: string;
  /** Optional colour-band override (hex). When absent the grid assigns one per row. */
  band?: string;
  action: PosAction;
  /** When false the cell renders empty/disabled. Defaults to true. */
  enabled?: boolean;
  /**
   * Surface this action in the phone POS action bar (solo-professional layout).
   * `submenu` buttons so marked open their submenu as a bottom sheet on mobile
   * instead of swapping the desktop grid. Defaults to false.
   */
  mobile?: boolean;
}

export interface PosLayout {
  /** Matches `locations.category`, or "Default". */
  businessType: string;
  /** Grid column count for the function panel. */
  columns: number;
  /**
   * Sales-tax rate for this business type, as a fraction (0.07 = 7%).
   * `0` hides the tax line entirely (e.g. nail salons — services aren't taxed).
   * Omit to fall back to the app-wide `TAX_RATE`.
   */
  taxRate?: number;
  /**
   * Row-major cells. `null` = intentional gap. Length need not equal
   * `columns * rows`; the grid flows.
   */
  buttons: (PosButton | null)[];
  /**
   * Optional 4-slot row rendered directly beneath the numpad, in place of the
   * default quick-cash ($1/$5/$10/$20) buttons. `null` = empty cell. Use for the
   * business type's most-reached utility actions (refund, void, no-sale, …).
   * Omit to keep the quick-cash buttons.
   */
  keypadButtons?: (PosButton | null)[];
}
