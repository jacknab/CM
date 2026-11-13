/**
 * One of the business's own kiosk screens (Kiosk Builder screens, plans/kiosk-builder.md): a heading, a grid of
 * buttons that always fills the space between the heading and the footer (cols × rows per page, never
 * scrolling), page arrows, and the footer the caller gives.
 *
 * The kiosk draws its screens with this, and the builder draws its editing canvas with it too, so the owner sees
 * exactly what clients will see. Every size is a share of the screen (CSS container units), so the 15" kiosk, a
 * tablet and the builder's small canvas all show the same layout.
 */
import type { ReactNode } from "react";
import { menuPageCount, menuSlotsPerPage, type KioskMenu, type KioskTile } from "@shared/kiosk/layout";

export interface MenuService {
  id: number;
  name: string;
  price: number;
  duration: number;
  imageUrl?: string | null;
  customIllustrationUrl?: string | null;
  illustrationImageUrl?: string | null;
}

export interface MenuAddon { id: number; name: string; price: number; imageUrl?: string | null }

export interface MenuColors { primary: string; bg: string; surface: string; text: string; muted: string; border: string; tint: string }

export interface KioskMenuScreenProps {
  menu: KioskMenu;
  page: number;
  onPage: (page: number) => void;
  services: Map<number, MenuService>;
  menus: Map<string, KioskMenu>;
  /** Add-ons and Kiosk Extras the buttons may choose. */
  addons?: Map<number, MenuAddon>;
  selectedAddonIds?: number[];
  /** A short message over the grid ("Please choose a service first"). */
  note?: string | null;
  heading: string;
  eyebrow?: string;
  colors: MenuColors;
  serif?: boolean;
  showPrice: boolean;
  showDuration: boolean;
  selectedServiceIds?: number[];
  footer?: ReactNode;
  /** "kiosk": tap a button. "editor": empty slots can be filled, buttons dragged between slots. */
  mode: "kiosk" | "editor";
  onTile?: (tile: KioskTile, slot: number) => void;
  onEmptySlot?: (slot: number) => void;
  onMoveTile?: (from: number, to: number) => void;
  activeSlot?: number | null;
}

const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;
export const servicePicture = (s: MenuService | undefined) => s?.customIllustrationUrl || s?.imageUrl || s?.illustrationImageUrl || null;

export function KioskMenuScreen(p: KioskMenuScreenProps) {
  const { menu, colors: c } = p;
  const per = menuSlotsPerPage(menu);
  const pages = menuPageCount(menu);
  const page = Math.min(Math.max(0, p.page), pages - 1);
  const slots = Array.from({ length: per }, (_, i) => page * per + i);
  const press = (fn: () => void) => (p.mode === "kiosk"
    ? { onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); } }
    : { onClick: fn });
  const headingFont = p.serif ? "'Playfair Display', Georgia, serif" : undefined;

  const tileView = (tile: KioskTile, slot: number) => {
    const svc = tile.kind === "service" ? p.services.get(tile.serviceId!) : undefined;
    const target = tile.kind === "menu" ? p.menus.get(tile.menuId!) : undefined;
    const addon = tile.kind === "addon" ? p.addons?.get(tile.addonId!) : undefined;
    const missing = tile.kind === "service" ? !svc : tile.kind === "addon" ? !addon : !target;
    // The kiosk leaves a gap where a service has left the menu; the builder shows it so it can be fixed.
    if (missing && p.mode === "kiosk") return <div key={slot} />;
    const label = tile.label || svc?.name || addon?.name || target?.name || "Not on your menu";
    const picture = tile.imageUrl || servicePicture(svc) || addon?.imageUrl || null;
    const selected = (!!svc && !!p.selectedServiceIds?.includes(svc.id)) || (!!addon && !!p.selectedAddonIds?.includes(addon.id));
    const active = p.activeSlot === slot;
    return (
      <button key={slot} type="button" {...press(() => p.onTile?.(tile, slot))}
        draggable={p.mode === "editor"}
        onDragStart={(e) => { e.dataTransfer.setData("text/kiosk-slot", String(slot)); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => { if (p.mode === "editor") e.preventDefault(); }}
        onDrop={(e) => { const from = Number(e.dataTransfer.getData("text/kiosk-slot")); if (Number.isInteger(from) && from !== slot) p.onMoveTile?.(from, slot); }}
        data-testid={`kiosk-tile-${slot}`}
        className="relative overflow-hidden flex flex-col text-left active:scale-[0.98] transition-transform"
        style={{
          containerType: "size", minHeight: 0, minWidth: 0,
          background: c.surface, color: c.text, borderRadius: "2.2cqmin",
          border: `0.35cqmin solid ${selected || active ? c.primary : c.border}`,
          boxShadow: selected || active ? `0 0 0 0.6cqmin ${c.primary}33` : "0 0.4cqmin 1.6cqmin rgba(0,0,0,0.06)",
          opacity: missing ? 0.55 : 1,
          ...(menu.style === "single" ? { width: "72%", height: "82%", justifySelf: "center", alignSelf: "center" } : {}),
        }}>
        {picture ? (
          <div style={{ flex: "1 1 0", minHeight: 0, background: c.tint }}>
            <img src={picture} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : (
          <div style={{ flex: "1 1 0", minHeight: 0, background: tile.kind === "menu" ? `${c.primary}18` : c.tint, display: "flex", alignItems: "center", justifyContent: "center", padding: "6cqmin" }}>
            {tile.kind === "menu" && (
              <span style={{ fontFamily: headingFont, fontWeight: 800, textAlign: "center", lineHeight: 1.1, color: c.text, fontSize: "clamp(14px, 13cqmin, 64px)" }}>{label}</span>
            )}
          </div>
        )}
        {(picture || tile.kind !== "menu") && (
          <div style={{ flexShrink: 0, padding: "4cqmin 5cqmin 5cqmin", borderTop: `1px solid ${c.border}` }}>
            <p style={{ margin: 0, fontWeight: 800, lineHeight: 1.15, fontSize: "clamp(12px, 8cqmin, 40px)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontFamily: headingFont }}>
              {label}{tile.kind === "menu" ? " ›" : ""}
            </p>
            {addon && p.showPrice && addon.price > 0 && (
              <p style={{ margin: "1.5cqmin 0 0", color: c.muted, fontSize: "clamp(11px, 6.5cqmin, 30px)", fontWeight: 700 }}>+{money(addon.price)}</p>
            )}
            {svc && (p.showPrice || p.showDuration) && (
              <p style={{ margin: "1.5cqmin 0 0", color: c.muted, fontSize: "clamp(11px, 6.5cqmin, 30px)", fontWeight: 700 }}>
                {p.showPrice ? money(svc.price) : ""}{p.showPrice && p.showDuration ? " · " : ""}{p.showDuration ? `${svc.duration} min` : ""}
              </p>
            )}
          </div>
        )}
        {selected && (
          <span aria-hidden style={{ position: "absolute", top: "4cqmin", right: "4cqmin", width: "clamp(20px, 14cqmin, 56px)", height: "clamp(20px, 14cqmin, 56px)",
            borderRadius: "50%", background: c.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "clamp(11px, 8cqmin, 30px)" }}>✓</span>
        )}
      </button>
    );
  };

  const emptyView = (slot: number) => p.mode === "editor" ? (
    <button key={slot} type="button" onClick={() => p.onEmptySlot?.(slot)} data-testid={`kiosk-slot-${slot}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { const from = Number(e.dataTransfer.getData("text/kiosk-slot")); if (Number.isInteger(from)) p.onMoveTile?.(from, slot); }}
      style={{
        minHeight: 0, minWidth: 0, borderRadius: "2.2cqmin", color: c.muted, background: "transparent",
        border: `0.35cqmin dashed ${p.activeSlot === slot ? c.primary : c.border}`, fontSize: "clamp(11px, 2.4cqmin, 22px)", fontWeight: 600,
        ...(menu.style === "single" ? { width: "72%", height: "82%", justifySelf: "center", alignSelf: "center" } : {}),
      }}>
      + Add
    </button>
  ) : <div key={slot} />;

  const arrow = (dir: -1 | 1) => {
    const to = page + dir;
    const off = to < 0 || to >= pages;
    return (
      <button type="button" disabled={off} aria-label={dir < 0 ? "Previous page" : "Next page"} {...press(() => !off && p.onPage(to))}
        style={{ border: `1px solid ${c.border}`, background: c.surface, color: c.text, borderRadius: "999px", opacity: off ? 0.35 : 1,
          width: "8cqmin", height: "8cqmin", fontSize: "4cqmin", fontWeight: 800 }}>
        {dir < 0 ? "‹" : "›"}
      </button>
    );
  };

  return (
    <div style={{ width: "100%", height: "100%", containerType: "size", display: "flex", flexDirection: "column", background: c.bg, color: c.text, userSelect: "none" }}>
      <div style={{ flexShrink: 0, padding: "4cqmin 4.5cqmin 3cqmin", background: c.surface, borderBottom: `1px solid ${c.border}` }}>
        {p.eyebrow && <p style={{ margin: 0, color: c.primary, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "1.9cqmin" }}>{p.eyebrow}</p>}
        <h2 style={{ margin: "0.8cqmin 0 0", fontWeight: 900, lineHeight: 1.1, fontSize: "5cqmin", fontFamily: headingFont }}>{p.heading}</h2>
      </div>
      <div style={{
        flex: "1 1 0", minHeight: 0, padding: "3cqmin 4cqmin", display: "grid", gap: "2.2cqmin",
        gridTemplateColumns: `repeat(${menu.style === "single" ? 1 : menu.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${menu.style === "single" ? 1 : menu.rows}, minmax(0, 1fr))`,
      }}>
        {slots.map((slot) => { const t = menu.tiles[slot]; return t ? tileView(t, slot) : emptyView(slot); })}
      </div>
      {pages > 1 && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "3cqmin", paddingBottom: "2cqmin", color: c.muted, fontSize: "2.6cqmin", fontWeight: 700 }}>
          {arrow(-1)}<span>{page + 1} / {pages}</span>{arrow(1)}
        </div>
      )}
      {p.note && (
        <div role="status" style={{ flexShrink: 0, margin: "0 4cqmin 2cqmin", padding: "2cqmin 3cqmin", borderRadius: 14, textAlign: "center",
          background: "rgba(15,23,42,.88)", color: "#fff", fontWeight: 700, fontSize: "2.6cqmin" }}>{p.note}</div>
      )}
      {p.footer}
    </div>
  );
}
