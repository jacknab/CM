/**
 * A picture screen (Kiosk Builder screens, plans/kiosk-builder.md): the business's own picture of the whole
 * screen, with tap spots over the parts that act as buttons.
 *
 * The picture is drawn in a 9:16 frame (the 15" kiosk, standing): on the kiosk that is the whole screen; on any
 * other shape it is centered. Spots are percentages of that frame, so they sit on the same part of the picture
 * everywhere — the kiosk, a tablet and the builder's canvas. The kiosk and the builder both draw it with this.
 *
 * In the builder ("editor") the spots show their borders and names, and can be dragged and resized from their
 * corners.
 */
import { useRef, useState } from "react";
import { KIOSK_SPOT_MIN, type KioskMenu, type KioskSpot } from "@shared/kiosk/layout";

export interface PictureColors { primary: string; bg: string }

type Rect = Pick<KioskSpot, "x" | "y" | "w" | "h">;
type Drag = { id: string; mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: Rect; frameW: number; frameH: number };

const clampRect = (r: Rect): Rect => {
  const w = Math.min(100, Math.max(KIOSK_SPOT_MIN.w, r.w));
  const h = Math.min(100, Math.max(KIOSK_SPOT_MIN.h, r.h));
  const round = (n: number) => Math.round(n * 100) / 100;
  return { x: round(Math.min(100 - w, Math.max(0, r.x))), y: round(Math.min(100 - h, Math.max(0, r.y))), w: round(w), h: round(h) };
};

export function KioskPictureScreen(p: {
  menu: KioskMenu;
  colors: PictureColors;
  mode: "kiosk" | "editor";
  /** Spots shown as chosen (a chosen service or add-on). */
  selectedSpotIds?: string[];
  onSpot?: (spot: KioskSpot) => void;
  /** A short message over the bottom of the picture ("Please choose a service first"). */
  note?: string | null;
  // editor
  activeSpotId?: string | null;
  onSelectSpot?: (id: string | null) => void;
  onChangeSpot?: (id: string, rect: Rect) => void;
  spotLabel?: (spot: KioskSpot) => string;
  emptyText?: string;
}) {
  const { menu, colors: c } = p;
  const frameRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ id: string; rect: Rect } | null>(null);
  const editor = p.mode === "editor";

  // The drag lives in a ref: pointer events can arrive before React has drawn the last change.
  const dragRef = useRef<Drag | null>(null);
  const startDrag = (e: React.PointerEvent, spot: KioskSpot, mode: Drag["mode"]) => {
    if (!editor) return;
    e.stopPropagation();
    e.preventDefault();
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    p.onSelectSpot?.(spot.id);
    const d: Drag = { id: spot.id, mode, startX: e.clientX, startY: e.clientY, start: { x: spot.x, y: spot.y, w: spot.w, h: spot.h }, frameW: box.width, frameH: box.height };
    dragRef.current = d;
  };
  /** Where the spot is with the pointer at (clientX, clientY). */
  const rectAt = (d: Drag, clientX: number, clientY: number): Rect => {
    const dx = ((clientX - d.startX) / d.frameW) * 100;
    const dy = ((clientY - d.startY) / d.frameH) * 100;
    const s = d.start;
    if (d.mode === "move") return clampRect({ ...s, x: s.x + dx, y: s.y + dy });
    const left = d.mode === "nw" || d.mode === "sw", top = d.mode === "nw" || d.mode === "ne";
    const x2 = s.x + s.w, y2 = s.y + s.h;
    const nx = Math.max(0, left ? Math.min(s.x + dx, x2 - KIOSK_SPOT_MIN.w) : s.x);
    const ny = Math.max(0, top ? Math.min(s.y + dy, y2 - KIOSK_SPOT_MIN.h) : s.y);
    const w = left ? x2 - nx : s.w + dx, h = top ? y2 - ny : s.h + dy;
    return clampRect({ x: nx, y: ny, w: Math.min(w, 100 - nx), h: Math.min(h, 100 - ny) });
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) setLive({ id: d.id, rect: rectAt(d, e.clientX, e.clientY) });
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    // From where the pointer let go, not from the last drawn position.
    if (d && (e.clientX !== d.startX || e.clientY !== d.startY)) p.onChangeSpot?.(d.id, rectAt(d, e.clientX, e.clientY));
    setLive(null);
  };

  return (
    <div style={{ width: "100%", height: "100%", containerType: "size", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, userSelect: "none" }}
      onPointerDown={() => editor && p.onSelectSpot?.(null)}>
      <div ref={frameRef} data-testid="kiosk-picture-frame"
        style={{ position: "relative", width: "min(100cqw, calc(100cqh * 9 / 16))", aspectRatio: "9 / 16", overflow: "hidden", touchAction: "none" }}
        onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {menu.imageUrl ? (
          <img src={menu.imageUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "10%",
            color: "#64748b", fontSize: "clamp(12px, 3.5cqmin, 28px)", border: editor ? "2px dashed #cbd5e1" : undefined }}>
            {p.emptyText ?? ""}
          </div>
        )}
        {menu.spots.map((spot) => {
          const r = live?.id === spot.id ? live.rect : spot;
          const chosen = !!p.selectedSpotIds?.includes(spot.id);
          const active = editor && p.activeSpotId === spot.id;
          const label = p.spotLabel?.(spot) ?? "";
          return (
            <div key={spot.id} role="button" aria-label={label || undefined} data-testid={`kiosk-spot-${spot.id}`}
              onPointerDown={(e) => {
                if (editor) return startDrag(e, spot, "move");
                e.preventDefault();
                p.onSpot?.(spot);
              }}
              style={{
                position: "absolute", left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
                cursor: editor ? "move" : "pointer", borderRadius: 8,
                border: editor ? `2px ${active ? "solid" : "dashed"} ${active ? c.primary : "rgba(15,23,42,.75)"}` : "none",
                background: editor ? (active ? `${c.primary}26` : "rgba(255,255,255,.18)") : chosen ? "rgba(255,255,255,.16)" : "transparent",
                // Chosen: a white ring inside a ring of the kiosk's colour, so it shows on any picture.
                boxShadow: editor ? "0 0 0 1px rgba(255,255,255,.8)" : chosen ? `0 0 0 4px #fff, 0 0 0 8px ${c.primary}, 0 6px 18px rgba(0,0,0,.25)` : undefined,
              }}>
              {editor && label && (
                <span style={{ position: "absolute", left: 4, top: 4, maxWidth: "calc(100% - 8px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  background: "rgba(15,23,42,.85)", color: "#fff", fontSize: 11, lineHeight: "16px", padding: "0 6px", borderRadius: 4, pointerEvents: "none" }}>{label}</span>
              )}
              {!editor && chosen && (
                <span aria-hidden style={{ position: "absolute", top: "6%", right: "4%", width: "clamp(22px, 6cqmin, 48px)", height: "clamp(22px, 6cqmin, 48px)", borderRadius: "50%",
                  background: c.primary, color: "#fff", border: "3px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "clamp(12px, 3.4cqmin, 26px)" }}>✓</span>
              )}
              {active && (["nw", "ne", "sw", "se"] as const).map((corner) => (
                <span key={corner} onPointerDown={(e) => startDrag(e, spot, corner)} data-testid={`spot-handle-${corner}`}
                  style={{ position: "absolute", width: 14, height: 14, background: "#fff", border: `2px solid ${c.primary}`, borderRadius: 3,
                    left: corner.includes("w") ? -8 : undefined, right: corner.includes("e") ? -8 : undefined,
                    top: corner.startsWith("n") ? -8 : undefined, bottom: corner.startsWith("s") ? -8 : undefined,
                    cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }} />
              ))}
            </div>
          );
        })}
        {p.note && (
          <div role="status" style={{ position: "absolute", left: "8%", right: "8%", bottom: "4%", padding: "2.4cqmin 3cqmin", borderRadius: 16, textAlign: "center",
            background: "rgba(15,23,42,.88)", color: "#fff", fontWeight: 700, fontSize: "clamp(13px, 3.2cqmin, 26px)", pointerEvents: "none" }}>
            {p.note}
          </div>
        )}
      </div>
    </div>
  );
}
