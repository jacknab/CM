import { useState, type CSSProperties } from "react";
import { ArrowLeft, DoorOpen, LayoutGrid, Footprints, Gift, Hand, HandCoins, MoreHorizontal, Package, Percent, Plus, Printer, ShoppingBag, Sparkles, UserRound, Users, WalletCards, Zap } from "lucide-react";
import { QUICK_TICKET_STEPS } from "@shared/nailCheckout";
import { formatDuration, parseKeypadAmount } from "./ticketDraft";
import { POS_GRID_COLUMNS, POS_GRID_MAIN, POS_GRID_SLOTS, type PosGrid, type PosGridConfig } from "@shared/posGrid";

export interface CatalogService { id: number; name: string; duration: number; price: number | string }
export interface CatalogAddon { id: number; name: string; price: number | string; duration: number | null }
export interface CatalogGroup { key: string; name: string; services: CatalogService[] }

const money = (v: number | string) => `$${Number(v).toFixed(2)}`;

/** Category → icon, by what the name says (salons name their own categories). */
function iconFor(name: string) {
  const n = name.toLowerCase();
  if (/kid|child/.test(n)) return UserRound;
  if (/combo|package|deal/.test(n)) return Gift;
  if (/pedi/.test(n)) return Zap;
  if (/gel\s*x|builder|extension/.test(n)) return WalletCards;
  if (/dip|wax|polish|repair|extra/.test(n)) return Package;
  if (/mani|gel/.test(n)) return Hand;
  if (/add/.test(n)) return Plus;
  if (/acrylic|art|spa/.test(n)) return Sparkles;
  return Package;
}

/* ── Keypad: rings up a custom dollar amount as a line on the ticket ─────── */

const KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "↶", "1", "2", "3", "X", "00", "0", "ENTER"];

/**
 * `onEnter(amount, qty, label?, isRetail?)` — a label only comes with Quick Ticket, which walks through the steps (Removal,
 * Nail Length, Nail Shape, Nail Art, Design, Extra): ENTER adds the typed amount under that step's name (or skips the step
 * when nothing is typed), and ↶ leaves Quick Ticket. `isRetail` marks a Custom Amount as a product sale (commissioned at
 * the product rate, not the service rate) instead of a service upcharge — toggle Retail on before ringing one up; it's the
 * only way to mark a retail sale on a ticket that isn't the one currently open at Checkout (e.g. for a Group Pay member).
 */
/** The functions under the keypad that belong to paying a ticket: the ticket is saved and its checkout opens on that function. */
export type CheckoutFn = "group" | "tip" | "discount";

export function Keypad({ locked, onEnter, onGiftCard, onCheckoutFn, onNoSale, onNotice }: {
  locked: boolean; onEnter: (amount: number, qty: number, label?: string, isRetail?: boolean) => void; onGiftCard?: () => void;
  onCheckoutFn?: (fn: CheckoutFn) => void; onNoSale?: () => void; onNotice?: (text: string) => void;
}) {
  const [display, setDisplay] = useState("");
  const [qty, setQty] = useState(1);
  const [guided, setGuided] = useState<number | null>(null);
  const [retail, setRetail] = useState(false);

  const press = (key: string) => {
    if (locked) return;
    if (key === "⌫") { setDisplay((d) => d.slice(0, -1)); return; }
    if (key === "↶") { setDisplay(""); setQty(1); setGuided(null); return; }
    if (key === "X") {
      if (guided !== null) return; // Quick Ticket adds one of each step
      // "3 X" then the price = three of them.
      const n = Number(display);
      if (Number.isInteger(n) && n >= 1 && n <= 99) { setQty(n); setDisplay(""); }
      return;
    }
    if (key === "ENTER") {
      const amount = parseKeypadAmount(display);
      if (guided !== null) {
        if (amount != null) onEnter(amount, 1, QUICK_TICKET_STEPS[guided].label);
        setDisplay("");
        setGuided(guided + 1 >= QUICK_TICKET_STEPS.length ? null : guided + 1);
        return;
      }
      if (amount != null) onEnter(amount, qty, retail ? "Retail Item" : undefined, retail);
      // Auto-clear Retail after one charge — unlike Quick Ticket (which self-exits once its fixed
      // step list ends), nothing here would ever remind staff it's still on, and leaving it stuck
      // "on" silently mislabels the NEXT unrelated custom charge as retail too (wrong commission
      // rate). Ringing up several retail items in a row just means tapping Retail again each time.
      setDisplay(""); setQty(1); setRetail(false);
      return;
    }
    setDisplay((d) => (d + key).slice(0, 7));
  };

  return (
    <div className={`keypad ticket-keypad pay-keypad ${locked ? "keypad-locked" : ""}`} data-testid="nail-keypad">
      <div className="calculator-display" data-testid="nail-keypad-display">
        {guided !== null && <span className="display-prompt" data-testid="nail-quick-prompt">{QUICK_TICKET_STEPS[guided].prompt} · {guided + 1}/{QUICK_TICKET_STEPS.length}</span>}
        {guided === null && retail && <span className="display-prompt" data-testid="nail-retail-prompt">RETAIL ITEM</span>}
        {qty > 1 && <span className="display-qty">{qty} ×</span>}
        {display ? `$${display}` : ""}
      </div>
      <div className="key-grid">
        {KEYS.map((key) => (
          <button key={key} type="button" disabled={locked} onClick={() => press(key)} data-testid={`nail-key-${key}`}
            className={key === "ENTER" ? "enter-key" : key === "↶" ? "undo-key" : key === "X" ? "qty-key" : ""}>
            {key}
            {key === "X" && <small>Qty</small>}
          </button>
        ))}
      </div>
      {/* The same two rows of functions the checkout screen has, in the same places, so building a ticket and paying it are one POS. */}
      <div className="money-grid pay-fn-row" data-testid="nail-fn-row-top">
        <button type="button" disabled={locked} onClick={() => { setDisplay(""); setQty(1); setGuided((g) => (g === null ? 0 : null)); }} data-testid="nail-quick-ticket">
          <Zap size={20} /><span>{guided !== null ? "Exit Quick Ticket" : "Quick Ticket"}</span>
        </button>
        <button type="button" disabled={locked} onClick={() => onCheckoutFn?.("group")} data-testid="nail-fn-group"><Users size={20} /><span>Group Pay</span></button>
        <button type="button" disabled={locked} className={retail ? "fn-btn-active" : ""}
          onClick={() => setRetail((v) => !v)} data-testid="nail-retail-toggle" aria-pressed={retail}>
          <ShoppingBag size={20} /><span>{retail ? "Retail ✓" : "Retail"}</span>
        </button>
        <button type="button" disabled={locked || !onGiftCard} onClick={onGiftCard} data-testid="nail-gift-card">
          <Gift size={20} /><span>Gift Card</span>
        </button>
      </div>
      <div className="money-grid pay-fn-row pay-fn-row-stacked">
        <button type="button" disabled={locked} onClick={() => onCheckoutFn?.("tip")} data-testid="nail-fn-tip"><HandCoins size={20} /><span>Tip Adjust</span></button>
        <button type="button" disabled={locked} onClick={() => onCheckoutFn?.("discount")} data-testid="nail-fn-discount"><Percent size={20} /><span>Discount</span></button>
        <button type="button" disabled={locked} onClick={onNoSale} data-testid="nail-fn-nosale"><DoorOpen size={20} /><span>No Sale</span></button>
        <button type="button" disabled={locked} onClick={() => onNotice?.("Reprint — coming soon")} data-testid="nail-fn-reprint"><Printer size={20} /><span>Reprint</span></button>
      </div>
    </div>
  );
}

interface Props {
  /** The key grid the manager arranged; without one it is filled automatically from the catalog. */
  layout?: PosGridConfig | null;
  locked: boolean;
  groups: CatalogGroup[];
  activeGroup: string;
  onGroup: (key: string) => void;
  serviceId: number | null;
  onService: (svc: CatalogService) => void;
  addons: CatalogAddon[];
  moreAddons: boolean;
  onToggleMore: () => void;
  hasMoreAddons: boolean;
  addonIds: number[];
  onToggleAddon: (id: number) => void;
  /** A way out of the grid, as the last key of the main grid (e.g. back to Payment while a ticket is being paid). */
  exit?: { label: string; onClick: () => void };
}

/** The right panel is a fixed 2 × 6 grid of keys, like a register's — two across so every key is easy to read and
 *  hit on a 10" tablet. It never changes shape. */
const GRID_COLUMNS = POS_GRID_COLUMNS;
const GRID_SLOTS = POS_GRID_SLOTS;
/** The band along the bottom of each row of keys, top row first. */
export const ROW_BANDS = ["#f4d000", "#cfb6ff", "#00c8ff", "#ff8bd4", "#b493ff", "#95d8ff"];

/** `label` / `color`: the manager's own name and band colour for that key. */
export type GridKey =
  | { kind: "category"; group: CatalogGroup; label?: string; color?: string }
  | { kind: "service"; service: CatalogService; label?: string; color?: string }
  | { kind: "grid"; grid: PosGrid; label?: string; color?: string }
  | { kind: "more" }
  | { kind: "back"; label?: string; color?: string }
  | { kind: "exit" }
  | { kind: "empty" };

/** Where the panel is: the main grid, a catalog category's services, or another grid the manager made. */
export type GridPlace = { at: "main" } | { at: "category"; key: string } | { at: "grid"; id: string };

/**
 * What sits in each of the 12 positions. The main grid is the catalog's categories; a category key opens
 * that category's grid of services, whose last key goes back. Anything that doesn't fit goes to further
 * pages behind a MORE key (the key just before the last), which cycles round to the first page again.
 */
export function gridKeys(groups: CatalogGroup[], openKey: string | null, page: number, hasExit = false): GridKey[] {
  const open = openKey ? groups.find((g) => g.key === openKey) : undefined;
  const items: GridKey[] = open
    ? open.services.map((service) => ({ kind: "service", service }))
    : groups.map((group) => ({ kind: "category", group }));
  // The last position: Back inside a category; on the main grid, the way out of the grid when there is one
  // (back to Payment, while a ticket is being paid).
  const reserved = open || hasExit ? 1 : 0;
  const room = GRID_SLOTS - reserved;
  const paged = items.length > room;
  const perPage = paged ? room - 1 : room; // one position goes to MORE
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const shown = items.slice((page % pages) * perPage, (page % pages) * perPage + perPage);
  const keys: GridKey[] = [...shown];
  while (keys.length < perPage) keys.push({ kind: "empty" });
  if (paged) keys.push({ kind: "more" });
  if (open) keys.push({ kind: "back" });
  else if (hasExit) keys.push({ kind: "exit" });
  return keys;
}

/** One grid the manager arranged, as keys: anything pointing at a category, service or grid that no longer exists is a blank key. */
export function arrangedKeys(grid: PosGrid, layout: PosGridConfig, groups: CatalogGroup[]): GridKey[] {
  const services = new Map<number, CatalogService>();
  for (const g of groups) for (const svc of g.services) services.set(svc.id, svc);
  return Array.from({ length: GRID_SLOTS }, (_, i): GridKey => {
    const k = grid.keys[i];
    if (!k) return { kind: "empty" };
    const look = { label: k.label, color: k.color };
    if (k.type === "category") { const group = groups.find((g) => g.key === k.groupKey); return group ? { kind: "category", group, ...look } : { kind: "empty" }; }
    if (k.type === "service") { const service = services.get(k.serviceId); return service ? { kind: "service", service, ...look } : { kind: "empty" }; }
    if (k.type === "grid") { const target = layout.grids.find((g) => g.id === k.gridId); return target ? { kind: "grid", grid: target, ...look } : { kind: "empty" }; }
    return { kind: "back", ...look };
  });
}

/**
 * The keys for wherever the panel is. With a layout from the manager, the main grid and their own grids are
 * drawn as arranged; a category key still opens that category's services, filled from the catalog.
 * A grid of theirs with no Back key gets one in the last position, so nobody is ever stuck in it; while a
 * ticket is being paid the main grid's last position is the way back to Payment.
 */
export function placeKeys(layout: PosGridConfig | null | undefined, groups: CatalogGroup[], place: GridPlace, page: number, hasExit = false): GridKey[] {
  if (place.at === "category" && groups.some((g) => g.key === place.key)) return gridKeys(groups, place.key, page);
  const grid = layout?.grids.find((g) => g.id === (place.at === "grid" ? place.id : POS_GRID_MAIN));
  if (!layout || !grid) return gridKeys(groups, null, page, hasExit);
  const keys = arrangedKeys(grid, layout, groups);
  if (grid.id !== POS_GRID_MAIN && !keys.some((k) => k.kind === "back")) keys[GRID_SLOTS - 1] = { kind: "back" };
  if (grid.id === POS_GRID_MAIN && hasExit) keys[GRID_SLOTS - 1] = { kind: "exit" };
  return keys;
}

/** One key of the grid, drawn the same on the POS and in the manager's editor. */
export function PosKeyButton({ k, index, onClick, disabled, selected, exitLabel, testId }: {
  k: GridKey; index: number; onClick?: () => void; disabled?: boolean; selected?: boolean; exitLabel?: string; testId?: string;
}) {
  const own = k.kind === "category" || k.kind === "service" || k.kind === "grid" || k.kind === "back" ? k.color : undefined;
  const band = { ["--pos-band" as string]: own ?? ROW_BANDS[Math.floor(index / GRID_COLUMNS)] } as CSSProperties;
  if (k.kind === "empty") {
    return onClick
      ? <button type="button" className={`pos-key pos-key-empty ${selected ? "selected" : ""}`} onClick={onClick} disabled={disabled} data-testid={testId} aria-label={`Empty position ${index + 1}`} />
      : <div className="pos-key pos-key-empty" aria-hidden />;
  }
  const cls = `pos-key ${k.kind === "service" ? "pos-key-service" : ""} ${k.kind === "back" || k.kind === "exit" || k.kind === "more" ? "pos-key-nav" : ""} ${selected ? "selected" : ""}`;
  let face: React.ReactNode;
  if (k.kind === "back") face = <><ArrowLeft size={24} /><strong>{k.label || "Back"}</strong></>;
  else if (k.kind === "exit") face = <><ArrowLeft size={24} /><strong>{exitLabel}</strong></>;
  else if (k.kind === "more") face = <><MoreHorizontal size={24} /><strong>More</strong></>;
  else if (k.kind === "grid") face = <><LayoutGrid size={26} /><strong>{k.label || k.grid.name}</strong></>;
  else if (k.kind === "category") { const Icon = iconFor(k.group.name); face = <><Icon size={26} /><strong>{k.label || k.group.name}</strong></>; }
  else face = <><strong>{k.label || k.service.name}</strong><span><b>{money(k.service.price)}</b><small>{formatDuration(k.service.duration)}</small></span></>;
  return (
    <button type="button" className={cls} style={band} disabled={disabled} onClick={onClick} data-testid={testId} aria-pressed={k.kind === "service" ? !!selected : undefined}>
      {face}
    </button>
  );
}

export function CatalogPanel(p: Props) {
  // The way here: the main grid first, then whatever was opened from it. Back takes one step off.
  // A ticket that already has its service (editing one) opens on that service's category.
  const [trail, setTrail] = useState<GridPlace[]>(() => {
    const group = p.serviceId != null ? p.groups.find((g) => g.services.some((s) => s.id === p.serviceId)) : undefined;
    return group ? [{ at: "main" }, { at: "category", key: group.key }] : [{ at: "main" }];
  });
  const [page, setPage] = useState(0);
  const place = trail[trail.length - 1];
  const open = (next: GridPlace) => { setTrail((t) => [...t, next]); setPage(0); if (next.at === "category") p.onGroup(next.key); };
  const back = () => { setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t)); setPage(0); };
  const keys = placeKeys(p.layout, p.groups, place, page, !!p.exit);

  return (
    <div className={`catalog-panel ${p.locked ? "catalog-locked" : ""}`} data-testid="nail-catalog">
      <div className="pos-grid" data-testid="nail-pos-grid" data-grid={place.at === "main" ? "main" : place.at === "category" ? place.key : place.id}>
        {keys.map((key, i) => (
          <PosKeyButton key={i} k={key} index={i} disabled={p.locked} exitLabel={p.exit?.label}
            selected={key.kind === "service" && p.serviceId === key.service.id}
            testId={key.kind === "back" ? "nail-grid-back" : key.kind === "exit" ? "nail-grid-exit" : key.kind === "more" ? "nail-grid-more"
              : key.kind === "category" ? `nail-cat-${key.group.key}` : key.kind === "service" ? `nail-service-${key.service.id}` : key.kind === "grid" ? `nail-grid-open-${key.grid.id}` : undefined}
            onClick={key.kind === "empty" ? undefined
              : key.kind === "back" ? back
              : key.kind === "exit" ? p.exit?.onClick
              : key.kind === "more" ? () => setPage((n) => n + 1)
              : key.kind === "category" ? () => open({ at: "category", key: key.group.key })
              : key.kind === "grid" ? () => open({ at: "grid", id: key.grid.id })
              : () => p.onService(key.service)} />
        ))}
      </div>

      {p.locked && (
        <div className="catalog-locked-overlay">
          <Footprints size={32} />
          <p>Check a client in, then open them from the Queue to build their ticket</p>
        </div>
      )}
    </div>
  );
}
