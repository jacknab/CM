import { useState } from "react";
import { Footprints, Gift, Hand, MoreHorizontal, Package, Plus, Sparkles, UserRound, WalletCards, Zap } from "lucide-react";
import { formatDuration, parseKeypadAmount, type NailConfigView, type NailGroup, type NailOption, type NailPick } from "./ticketDraft";

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

function ProductCard({ name, sub, price, onClick, compact, more, selected, locked, testId }: {
  name: string; sub?: string; price?: string; onClick: () => void; compact?: boolean; more?: boolean; selected?: boolean; locked: boolean; testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={locked} data-testid={testId}
      className={`product-card ${compact ? "compact" : ""} ${more ? "more-card" : ""} ${selected ? "selected" : ""} ${locked ? "product-card-locked" : ""}`}>
      {more ? (
        <>
          <MoreHorizontal size={21} />
          <strong>{name}</strong>
        </>
      ) : (
        <>
          <strong>{name}</strong>
          <span className="card-line">
            {sub ? <span>{sub}</span> : <span />}
            {price ? <b>{price}</b> : compact ? <span className="add-circle"><Plus size={13} /></span> : null}
          </span>
        </>
      )}
    </button>
  );
}

function NailGroupRow({ label, options, selected, group, onPick, locked }: { label: string; options: NailOption[]; selected: number | null; group: NailGroup; onPick: (g: NailGroup, id: number) => void; locked: boolean }) {
  if (options.length === 0) return null;
  return (
    <div className="nail-option-group">
      <span className="nail-option-label">{label}</span>
      <div className="addon-grid">
        {options.map((o) => (
          <ProductCard key={o.id} compact locked={locked} selected={selected === o.id} onClick={() => onPick(group, o.id)} testId={`nail-opt-${group}-${o.id}`}
            name={o.name} price={o.isQuote ? "Quote" : o.priceAdjustment > 0 ? `+${money(o.priceAdjustment)}` : undefined} />
        ))}
      </div>
    </div>
  );
}

/* ── Keypad: rings up a custom dollar amount as a line on the ticket ─────── */

const KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "↶", "1", "2", "3", "X", "00", "0", "ENTER"];

export function Keypad({ locked, onEnter }: { locked: boolean; onEnter: (amount: number, qty: number) => void }) {
  const [display, setDisplay] = useState("");
  const [qty, setQty] = useState(1);

  const press = (key: string) => {
    if (locked) return;
    if (key === "⌫") { setDisplay((d) => d.slice(0, -1)); return; }
    if (key === "↶") { setDisplay(""); setQty(1); return; }
    if (key === "X") {
      // "3 X" then the price = three of them.
      const n = Number(display);
      if (Number.isInteger(n) && n >= 1 && n <= 99) { setQty(n); setDisplay(""); }
      return;
    }
    if (key === "ENTER") {
      const amount = parseKeypadAmount(display);
      if (amount != null) onEnter(amount, qty);
      setDisplay(""); setQty(1);
      return;
    }
    setDisplay((d) => (d + key).slice(0, 7));
  };

  return (
    <div className={`keypad ${locked ? "keypad-locked" : ""}`} data-testid="nail-keypad">
      <div className="calculator-display" data-testid="nail-keypad-display">
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
      <div className="money-grid">
        {[1, 5, 10, 20].map((m) => (
          <button key={m} type="button" disabled={locked} onClick={() => setDisplay(String(m))}>${m}</button>
        ))}
      </div>
    </div>
  );
}

interface Props {
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
  nail: NailConfigView | null;
  pick: NailPick;
  onPick: (group: NailGroup, id: number) => void;
}

export function CatalogPanel(p: Props) {
  const services = p.groups.find((g) => g.key === p.activeGroup)?.services ?? [];
  return (
    <div className={`catalog-panel ${p.locked ? "catalog-locked" : ""}`} data-testid="nail-catalog">
      <div className="category-tabs">
        {p.groups.map((g) => {
          const Icon = iconFor(g.name);
          return (
            <button key={g.key} type="button" onClick={() => p.onGroup(g.key)} data-testid={`nail-cat-${g.key}`}
              className={g.key === p.activeGroup ? "active" : ""}>
              <Icon size={20} />
              <span>{g.name}</span>
            </button>
          );
        })}
      </div>

      <div className="service-grid">
        {services.map((s) => (
          <ProductCard key={s.id} locked={p.locked} selected={p.serviceId === s.id} onClick={() => p.onService(s)} testId={`nail-service-${s.id}`}
            name={s.name} sub={formatDuration(s.duration)} price={money(s.price)} />
        ))}
        {services.length === 0 && <p className="empty-state-hint">No services in this category.</p>}
      </div>

      {p.nail && (
        <div className="nail-options" data-testid="nail-options">
          <NailGroupRow label="NAIL LENGTH" options={p.nail.sizes} selected={p.pick.size} group="size" onPick={p.onPick} locked={p.locked} />
          <NailGroupRow label="NAIL SHAPE" options={p.nail.shapes} selected={p.pick.shape} group="shape" onPick={p.onPick} locked={p.locked} />
          <NailGroupRow label="NAIL ART" options={p.nail.applications} selected={p.pick.application} group="application" onPick={p.onPick} locked={p.locked} />
          <NailGroupRow label="ART EFFECT" options={p.nail.effects} selected={p.pick.effect} group="effect" onPick={p.onPick} locked={p.locked} />
        </div>
      )}

      {p.addons.length > 0 && (
        <>
          <h3 className="section-label">{p.moreAddons ? "ALL ADD-ONS" : "POPULAR ADD-ONS"}</h3>
          <div className="addon-grid">
            {p.addons.map((a) => (
              <ProductCard key={a.id} compact locked={p.locked} selected={p.addonIds.includes(a.id)} onClick={() => p.onToggleAddon(a.id)} testId={`nail-addon-${a.id}`}
                name={a.name} price={Number(a.price) > 0 ? `+${money(a.price)}` : undefined} />
            ))}
            {p.hasMoreAddons && (
              <ProductCard compact more locked={p.locked} name={p.moreAddons ? "Less" : "More"} onClick={p.onToggleMore} testId="nail-addon-more" />
            )}
          </div>
        </>
      )}

      {p.locked && (
        <div className="catalog-locked-overlay">
          <Footprints size={32} />
          <p>Start a Walk-In ticket to begin ringing up services</p>
        </div>
      )}
    </div>
  );
}
