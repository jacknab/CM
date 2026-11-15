/**
 * The kiosk's order board (layout.servicesView "board", the Order Board theme; owner, 2026-11-15): one screen to
 * choose services. Category buttons top left, the chosen category's services below them, and the client's order on
 * the right — each line with a remove button, the total and Continue at the bottom. It takes the place of the
 * category cards and the service list; the steps after it (questions, add-ons, staff, review) are the kiosk's own.
 */
import { useEffect, useState } from "react";

export interface BoardService { id: number; name: string; price: number; duration: number; imageUrl?: string | null }
export interface BoardGroup { key: string; label: string; imageUrl?: string | null; svcs: BoardService[] }
export interface BoardColors { primary: string; bg: string; surface: string; text: string; muted: string; border: string; selected: string; tint: string }
export interface BoardOrderLine { key: string; name: string; price: number | null; imageUrl?: string | null; onRemove: () => void }

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** A picture, else the first letter on a tint (the nail look has no emoji). */
function Thumb({ url, name, size, colors, round }: { url?: string | null; name: string; size: number; colors: BoardColors; round?: boolean }) {
  const [broken, setBroken] = useState(false);
  const r = round ? "50%" : 16;
  if (url && !broken) return <img src={url} alt="" draggable={false} onError={() => setBroken(true)} style={{ width: size, height: size, objectFit: "cover", borderRadius: r, flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: r, background: colors.tint, color: colors.primary, display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function KioskOrderBoard(p: {
  heading: string;
  groups: BoardGroup[];
  selectedIds: number[];
  onToggle: (svc: BoardService) => void;
  order: BoardOrderLine[];
  showPrice: boolean;
  showDuration: boolean;
  colors: BoardColors;
  labels: { back: string; continue: string; myOrder: string; orderEmpty: string; total: string; remove: string; forClient: string };
  onBack: () => void;
  onContinue: () => void;
  /** A message over the services ("You can choose up to 2 services"). */
  note?: string | null;
  serif?: boolean;
}) {
  const c = p.colors;
  // The category on show: the one holding the first chosen service, else the first.
  const [catKey, setCatKey] = useState<string>(() => p.groups.find((g) => g.svcs.some((s) => p.selectedIds.includes(s.id)))?.key ?? p.groups[0]?.key ?? "");
  useEffect(() => { if (!p.groups.some((g) => g.key === catKey) && p.groups[0]) setCatKey(p.groups[0].key); }, [p.groups, catKey]);
  const group = p.groups.find((g) => g.key === catKey) ?? p.groups[0];
  const total = p.order.reduce((n, l) => n + (l.price ?? 0), 0);
  const heading = p.serif ? "'Playfair Display', serif" : undefined;
  const press = (fn: () => void) => ({ onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); } });

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: c.bg, color: c.text, userSelect: "none" }} data-testid="kiosk-order-board">
      {/* ── Left: categories, then the category's services ── */}
      <div style={{ flex: "1 1 66%", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "28px 32px 12px", display: "flex", alignItems: "center", gap: 16 }}>
          <button type="button" {...press(p.onBack)} data-testid="board-back"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 52, padding: "0 18px 0 12px", borderRadius: 999, border: 0, background: "transparent", color: c.text, fontSize: 22, fontWeight: 800 }}>
            <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>‹</span> {p.labels.back}
          </button>
        </div>
        <h2 data-kx-edit="text:whatBringsYouIn" style={{ margin: "0 32px 18px", fontSize: 30, fontWeight: 800, lineHeight: 1.2, fontFamily: heading }}>{p.heading}</h2>

        {/* Category buttons */}
        <div data-kx-edit="category-cards" style={{ padding: "0 32px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {p.groups.map((g) => {
            const on = g.key === group?.key;
            const count = g.svcs.filter((s) => p.selectedIds.includes(s.id)).length;
            return (
              <button key={g.key} type="button" {...press(() => setCatKey(g.key))} data-testid={`board-cat-${g.key}`} aria-pressed={on}
                style={{ position: "relative", minHeight: 128, borderRadius: 22, border: 0, padding: "14px 10px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                  background: on ? c.selected : c.surface, color: c.text, boxShadow: on ? "0 8px 22px rgba(0,0,0,.12)" : "0 2px 8px rgba(0,0,0,.05)", transition: "transform .1s" }}>
                <Thumb url={g.imageUrl} name={g.label} size={58} colors={c} round />
                <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2, textAlign: "center" }}>{g.label}</span>
                {count > 0 && (
                  <span style={{ position: "absolute", top: 10, right: 12, minWidth: 26, height: 26, borderRadius: 13, background: c.primary, color: "#fff", fontSize: 14, fontWeight: 800, display: "grid", placeItems: "center", padding: "0 7px" }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* The category's services */}
        {group && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingTop: 26 }}>
            <h3 style={{ margin: "0 32px 16px", fontSize: 40, fontWeight: 900, lineHeight: 1.1, fontFamily: heading }}>{group.label}</h3>
            <div data-kx-edit="service-cards" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 32px 32px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignContent: "start" }}>
              {group.svcs.map((s) => {
                const on = p.selectedIds.includes(s.id);
                return (
                  <button key={s.id} type="button" {...press(() => p.onToggle(s))} data-testid={`board-svc-${s.id}`} aria-pressed={on}
                    style={{ position: "relative", borderRadius: 20, padding: "16px 12px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
                      background: c.surface, color: c.text, border: `3px solid ${on ? c.primary : "transparent"}`, boxShadow: on ? `0 0 0 4px ${c.primary}22` : "0 2px 8px rgba(0,0,0,.05)" }}>
                    <Thumb url={s.imageUrl} name={s.name} size={96} colors={c} />
                    <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{s.name}</span>
                    {(p.showPrice || p.showDuration) && (
                      <span style={{ fontSize: 15, color: c.muted }}>
                        {p.showPrice ? money(s.price) : ""}{p.showPrice && p.showDuration ? " · " : ""}{p.showDuration ? `${s.duration} min` : ""}
                      </span>
                    )}
                    {on && <span aria-hidden style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, background: c.primary, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {p.note && (
          <div role="status" style={{ margin: "0 32px 20px", padding: "12px 16px", borderRadius: 14, background: "rgba(15,23,42,.88)", color: "#fff", fontWeight: 700, fontSize: 16, textAlign: "center" }}>{p.note}</div>
        )}
      </div>

      {/* ── Right: the order ── */}
      <aside data-testid="board-order" style={{ flex: "0 0 34%", minWidth: 0, background: c.surface, borderLeft: `1px solid ${c.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "96px 24px 16px" }}>
          <h3 style={{ margin: 0, fontSize: 32, fontWeight: 900, lineHeight: 1.1, fontFamily: heading }}>{p.labels.myOrder}</h3>
          <p style={{ margin: "6px 0 0", fontSize: 16, color: c.muted }}>{p.labels.forClient}</p>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px" }}>
          {p.order.length === 0 ? (
            <p style={{ padding: "18px 6px", color: c.muted, fontSize: 16 }}>{p.labels.orderEmpty}</p>
          ) : p.order.map((l) => (
            <div key={l.key} data-testid="board-order-line" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 6px", borderBottom: `1px solid ${c.border}` }}>
              <Thumb url={l.imageUrl} name={l.name} size={52} colors={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{l.name}</p>
                {p.showPrice && l.price != null && <p style={{ margin: "2px 0 0", fontSize: 15, color: c.muted }}>{money(l.price)}</p>}
              </div>
              <button type="button" {...press(l.onRemove)} aria-label={`${p.labels.remove} ${l.name}`} data-testid="board-order-remove"
                style={{ width: 40, height: 40, borderRadius: 20, border: `2px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 22, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 20px 28px", borderTop: `1px solid ${c.border}` }}>
          {p.showPrice && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <span style={{ fontSize: 18, color: c.muted, fontWeight: 700 }}>{p.labels.total}</span>
              <span data-testid="board-total" style={{ fontSize: 30, fontWeight: 900 }}>{money(total)}</span>
            </div>
          )}
          <button type="button" {...press(() => { if (p.order.length) p.onContinue(); })} disabled={!p.order.length} data-testid="board-continue"
            style={{ width: "100%", height: 64, borderRadius: 18, border: 0, fontSize: 22, fontWeight: 900,
              background: p.order.length ? c.primary : c.border, color: p.order.length ? "#fff" : c.muted }}>
            {p.labels.continue}
          </button>
        </div>
      </aside>
    </div>
  );
}
