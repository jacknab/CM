/**
 * The kiosk's order board (layout.servicesView "board", the Order Board theme; owner, 2026-11-15): one screen to
 * choose services. Redesigned the same day after the owner's picture: the open category's picture and its name
 * at the top (no greeting: owner, 2026-11-15) with Search Services on the right; a column of category tiles on the left (the open
 * one dark with a gold edge); the category's services as photo cards (name, price, minutes). What the client has
 * chosen sits in a bar along the bottom — each as a chip with ×, the total and Continue. It takes the place of the
 * category cards and the service list; the steps after it (questions, add-ons, staff, review) are the kiosk's own.
 */
import { useEffect, useMemo, useState } from "react";

export interface BoardService { id: number; name: string; price: number; duration: number; imageUrl?: string | null;
  /** The coloured label on the photo ("Acrylic Full Set"), set on the service in Catalog. */
  badge?: { text: string; color: string } | null }
export interface BoardGroup { key: string; label: string; imageUrl?: string | null; svcs: BoardService[];
  /** A line under the category's name, set on the category in Catalog › Categories. */
  description?: string | null }
export interface BoardColors { primary: string; bg: string; surface: string; text: string; muted: string; border: string; selected: string; tint: string }
export interface BoardOrderLine { key: string; name: string; price: number | null; imageUrl?: string | null; onRemove: () => void }

const money = (n: number) => `$${n.toFixed(2)}`;
/**
 * A size given in pixels on the 1080-wide kiosk, in proportion to the board's own width (the builder's smaller
 * preview shows the same board, smaller) and never larger than designed (owner, 2026-11-15). The board's width, not
 * the window's: a window's width counts a scroll bar, which made the board too wide in the preview.
 */
const u = (px: number) => `min(${(px / 10.8).toFixed(3)}cqw, ${px}px)`;

/** A picture, else the first letter on a tint (the nail look has no emoji). */
function Thumb({ url, name, w, h, colors, radius = 16, letterSize }: { url?: string | null; name: string; w: number | string; h: number | string; colors: BoardColors; radius?: number | string; letterSize?: number | string }) {
  const [broken, setBroken] = useState(false);
  // h "auto": a 4:3 photo (the service cards).
  const box = h === "auto" ? { width: w, aspectRatio: "4 / 3" } : { width: w, height: h };
  if (url && !broken) return <img src={url} alt="" draggable={false} onError={() => setBroken(true)} style={{ ...box, objectFit: "cover", borderRadius: radius, display: "block", flexShrink: 0 }} />;
  return (
    <div style={{ ...box, borderRadius: radius, background: colors.tint, color: colors.primary, display: "grid", placeItems: "center", fontWeight: 900, fontSize: letterSize ?? 40, flexShrink: 0 }}>
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

/** A clock, drawn so it takes the text colour. */
const Clock = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M12 7v5.3l3.4 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const Magnifier = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
    <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function KioskOrderBoard(p: {
  groups: BoardGroup[];
  selectedIds: number[];
  onToggle: (svc: BoardService) => void;
  order: BoardOrderLine[];
  showPrice: boolean;
  showDuration: boolean;
  colors: BoardColors;
  labels: {
    back: string; continue: string; myOrder: string; orderEmpty: string; total: string; remove: string; forClient: string;
    search: string; results: (q: string) => string; noResults: string; done: string; space: string;
  };
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
  // Search Services: typed on the kiosk's own keyboard, across every category.
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const seen = new Set<number>();
    return p.groups.flatMap((g) => g.svcs).filter((s) => !seen.has(s.id) && (seen.add(s.id), s.name.toLowerCase().includes(q)));
  }, [query, p.groups]);
  const list = results ?? group?.svcs ?? [];
  const total = p.order.reduce((n, l) => n + (l.price ?? 0), 0);
  // Titles in a heavy plain font (the owner's picture), not the site's own heading font; the nail look keeps its serif.
  const heading = p.serif ? "'Playfair Display', serif" : "'DM Sans', 'Inter', sans-serif";
  const press = (fn: () => void) => ({ onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); } });

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: c.bg, color: c.text, userSelect: "none", overflow: "hidden", containerType: "inline-size" }} data-testid="kiosk-order-board">
      {/* ── Top: the category's picture, name and line; Search Services ── */}
      <header style={{ display: "flex", alignItems: "center", gap: u(20), padding: `${u(28)} ${u(28)} ${u(22)}` }}>
        <button type="button" {...press(p.onBack)} data-testid="board-back" aria-label={p.labels.back}
          style={{ width: u(52), height: u(52), borderRadius: u(26), border: `2px solid ${c.border}`, background: c.surface, color: c.text, fontSize: u(30), lineHeight: 1, display: "grid", placeItems: "center", flexShrink: 0 }}>‹</button>
        {!results && group && <Thumb url={group.imageUrl} name={group.label} w={u(84)} h={u(84)} radius="50%" colors={c} letterSize={u(36)} />}
        <div style={{ flex: 1, minWidth: u(0) }}>
          <h2 data-testid="board-title" style={{ margin: 0, fontSize: u(52), fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.01em", fontFamily: heading }}>
            {results ? p.labels.results(query.trim()) : group?.label}
          </h2>
          {!results && group?.description && (
            <p data-testid="board-description" style={{ margin: `${u(10)} 0 0`, fontSize: u(24), lineHeight: 1.3, color: c.muted }}>{group.description}</p>
          )}
        </div>
        <button type="button" {...press(() => setTyping(true))} data-testid="board-search"
          style={{ flexShrink: 0, width: u(340), height: u(64), borderRadius: u(32), border: `2.5px solid ${c.text}`, background: c.surface, color: query ? c.text : c.muted,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${u(18)} 0 ${u(24)}`, fontSize: u(21) }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{query || p.labels.search}</span>
          <span style={{ color: c.text, display: "flex" }}><Magnifier /></span>
        </button>
      </header>

      <div style={{ flex: 1, minHeight: u(0), display: "flex", gap: u(20), padding: `0 ${u(28)}` }}>
        {/* ── Left: the category tiles ── */}
        <nav data-kx-edit="category-cards" style={{ scrollbarWidth: "none", width: u(136), flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: u(12), padding: `${u(6)} ${u(4)} ${u(16)}` }}>
          {p.groups.map((g) => {
            const on = !results && g.key === group?.key;
            const count = g.svcs.filter((s) => p.selectedIds.includes(s.id)).length;
            return (
              <button key={g.key} type="button" {...press(() => { setQuery(""); setCatKey(g.key); })} data-testid={`board-cat-${g.key}`} aria-pressed={on}
                style={{ position: "relative", minHeight: u(104), borderRadius: u(18), padding: `${u(10)} ${u(8)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(6),
                  background: on ? c.text : c.surface, color: on ? c.surface : c.text, border: `4px solid ${on ? c.selected : "transparent"}`,
                  boxShadow: on ? `0 10px 24px ${c.text}33` : "0 4px 14px rgba(15,23,42,.10)" }}>
                <Thumb url={g.imageUrl} name={g.label} w={u(46)} h={u(46)} radius={u(14)} colors={c} letterSize={u(22)} />
                <span style={{ fontSize: u(15), fontWeight: 800, lineHeight: 1.15, textAlign: "center" }}>{g.label}</span>
                {count > 0 && (
                  <span style={{ position: "absolute", top: u(6), right: u(6), minWidth: u(24), height: u(24), borderRadius: u(12), background: c.primary, color: "#fff", fontSize: u(13), fontWeight: 800, display: "grid", placeItems: "center", padding: `0 ${u(8)}` }}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── The services ── */}
        <div data-kx-edit="service-cards" style={{ scrollbarWidth: "none", flex: 1, minWidth: u(0), overflowY: "auto", padding: `${u(6)} ${u(4)} ${u(24)}`, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: u(18), alignContent: "start" }}>
          {results && results.length === 0 && <p style={{ gridColumn: "1 / -1", fontSize: u(22), color: c.muted, padding: `${u(24)} ${u(4)}` }}>{p.labels.noResults}</p>}
          {list.map((s) => {
            const on = p.selectedIds.includes(s.id);
            return (
              <button key={s.id} type="button" {...press(() => p.onToggle(s))} data-testid={`board-svc-${s.id}`} aria-pressed={on}
                style={{ position: "relative", borderRadius: u(24), padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", textAlign: "left",
                  background: c.surface, color: c.text, border: `4px solid ${on ? c.primary : "transparent"}`,
                  boxShadow: on ? `0 0 0 4px ${c.primary}26, 0 10px 24px rgba(15,23,42,.12)` : "0 6px 18px rgba(15,23,42,.10)" }}>
                <Thumb url={s.imageUrl} name={s.name} w="100%" h="auto" radius={0} colors={c} letterSize={u(72)} />
                {s.badge && (
                  <span data-testid="board-svc-badge" style={{ position: "absolute", top: u(12), left: u(12), maxWidth: "calc(100% - 70px)", padding: `${u(6)} ${u(16)}`, borderRadius: u(999),
                    background: s.badge.color, color: "#fff", border: "2.5px solid #fff", boxShadow: "0 3px 10px rgba(0,0,0,.18)",
                    fontSize: u(18), fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.badge.text}</span>
                )}
                <div style={{ padding: `${u(14)} ${u(16)} ${u(18)}`, display: "flex", flexDirection: "column", gap: u(8) }}>
                  <span data-testid="board-svc-name" style={{ fontSize: u(24), fontWeight: 800, lineHeight: 1.15 }}>{s.name}</span>
                  {p.showPrice && <span style={{ fontSize: u(30), fontWeight: 900, lineHeight: 1 }}>{money(s.price)}</span>}
                  {p.showDuration && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: u(8), fontSize: u(21), color: c.text }}><Clock /> {s.duration} min</span>
                  )}
                </div>
                {on && <span aria-hidden style={{ position: "absolute", top: u(12), right: u(12), width: u(40), height: u(40), borderRadius: u(20), background: c.primary, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: u(22), border: "3px solid #fff" }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {p.note && (
        <div role="status" style={{ margin: `0 ${u(28)} ${u(12)}`, padding: `${u(14)} ${u(18)}`, borderRadius: u(16), background: "rgba(15,23,42,.88)", color: "#fff", fontWeight: 700, fontSize: u(19), textAlign: "center" }}>{p.note}</div>
      )}

      {/* ── Bottom: the order ── */}
      <footer data-testid="board-order" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: u(16), padding: `${u(16)} ${u(28)} ${u(22)}`, background: c.surface, borderTop: `1.5px solid ${c.border}`, boxShadow: "0 -6px 18px rgba(15,23,42,.06)" }}>
        <div style={{ flex: 1, minWidth: u(0) }}>
          <p style={{ margin: `0 0 ${u(8)}`, fontSize: u(15), fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted }}>{p.labels.myOrder} · {p.labels.forClient}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: u(8) }}>
            {p.order.length === 0 ? <span style={{ fontSize: u(18), color: c.muted }}>{p.labels.orderEmpty}</span> : p.order.map((l) => (
              <span key={l.key} data-testid="board-order-line" style={{ display: "inline-flex", alignItems: "center", gap: u(8), height: u(46), padding: `0 ${u(6)} 0 ${u(16)}`, borderRadius: u(23), background: c.bg, border: `1.5px solid ${c.border}`, fontSize: u(18), fontWeight: 700 }}>
                {l.name}{p.showPrice && l.price != null ? ` · ${money(l.price)}` : ""}
                <button type="button" {...press(l.onRemove)} aria-label={`${p.labels.remove} ${l.name}`} data-testid="board-order-remove"
                  style={{ width: u(34), height: u(34), borderRadius: u(17), border: 0, background: c.border, color: c.text, fontSize: u(20), fontWeight: 800, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        </div>
        {p.showPrice && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: u(15), fontWeight: 800, color: c.muted }}>{p.labels.total}</p>
            <p data-testid="board-total" style={{ margin: 0, fontSize: u(34), fontWeight: 900, lineHeight: 1.1 }}>{money(total)}</p>
          </div>
        )}
        <button type="button" {...press(() => { if (p.order.length) p.onContinue(); })} disabled={!p.order.length} data-testid="board-continue"
          style={{ flexShrink: 0, height: u(72), padding: `0 ${u(40)}`, borderRadius: u(36), border: 0, fontSize: u(24), fontWeight: 900,
            background: p.order.length ? c.primary : c.border, color: p.order.length ? "#fff" : c.muted }}>
          {p.labels.continue}
        </button>
      </footer>

      {/* ── The kiosk's own keyboard for Search Services ── */}
      {typing && (
        <div data-testid="board-keyboard" style={{ position: "fixed", left: u(0), right: u(0), bottom: u(0), background: c.surface, borderTop: `2px solid ${c.border}`, boxShadow: "0 -12px 30px rgba(15,23,42,.18)", padding: `${u(18)} ${u(20)} ${u(26)}`, zIndex: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(12), marginBottom: 14 }}>
            <div style={{ flex: 1, height: u(60), borderRadius: u(30), border: `2.5px solid ${c.text}`, display: "flex", alignItems: "center", gap: u(12), padding: `0 ${u(22)}`, fontSize: u(24) }}>
              <Magnifier /> <span style={{ color: query ? c.text : c.muted }}>{query || p.labels.search}</span>
            </div>
            <button type="button" {...press(() => setTyping(false))} data-testid="board-keyboard-done"
              style={{ height: u(60), padding: `0 ${u(30)}`, borderRadius: u(30), border: 0, background: c.primary, color: "#fff", fontSize: u(22), fontWeight: 900 }}>{p.labels.done}</button>
          </div>
          {KEY_ROWS.map((row) => (
            <div key={row} style={{ display: "flex", justifyContent: "center", gap: u(8), marginBottom: 8 }}>
              {row.split("").map((k) => (
                <button key={k} type="button" {...press(() => setQuery((q) => q + k.toLowerCase()))} data-testid={`board-key-${k}`}
                  style={{ width: u(88), height: u(70), borderRadius: u(14), border: `1.5px solid ${c.border}`, background: c.bg, color: c.text, fontSize: u(28), fontWeight: 700 }}>{k}</button>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "center", gap: u(8) }}>
            <button type="button" {...press(() => setQuery((q) => q + " "))} style={{ width: u(460), height: u(70), borderRadius: u(14), border: `1.5px solid ${c.border}`, background: c.bg, color: c.text, fontSize: u(20), fontWeight: 700 }}>{p.labels.space}</button>
            <button type="button" {...press(() => setQuery((q) => q.slice(0, -1)))} aria-label="Backspace" style={{ width: u(140), height: u(70), borderRadius: u(14), border: `1.5px solid ${c.border}`, background: c.bg, color: c.text, fontSize: u(28) }}>⌫</button>
            <button type="button" {...press(() => setQuery(""))} style={{ width: u(140), height: u(70), borderRadius: u(14), border: `1.5px solid ${c.border}`, background: c.bg, color: c.text, fontSize: u(20), fontWeight: 700 }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
