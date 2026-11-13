/**
 * Kiosk Builder › the left Screens panel (owner, 2026-11-13: "exactly like" the /nail grid editor's Grids panel).
 * Lists the configuration's own screens; a click opens one in the editor. "New screen" adds one with a temporary
 * name ("Screen 3"), opens it and selects the name to type over; the name box and Delete screen work on the open screen.
 * Screens are dragged up and down to set their order: on picture screens Continue goes to the next one in this order.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { KIOSK_MENU_LIMITS, type KioskLayout } from "@shared/kiosk/layout";
import "./screensPanel.css";

export function ScreensPanel(props: {
  draft: KioskLayout;
  /** The screen open in the editor (null: none, e.g. on the Welcome tab). */
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Moves the screen at `from` to `to` in the list. */
  onMove: (from: number, to: number) => void;
  /** Bumped when a new screen is made: the name box takes the focus. */
  focusName: number;
}) {
  const { draft, activeId } = props;
  const active = draft.menus.find((m) => m.id === activeId) ?? null;
  const nameRef = useRef<HTMLInputElement>(null);
  // Dragging a screen: the one held, and the place it would drop (before that row; the list's length = at the end).
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const endDrag = () => { setDragFrom(null); setDropAt(null); };
  const drop = () => {
    if (dragFrom != null && dropAt != null && dropAt !== dragFrom && dropAt !== dragFrom + 1) props.onMove(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
    endDrag();
  };
  // A new screen's temporary name is selected, so typing replaces it.
  useEffect(() => { if (props.focusName) { nameRef.current?.focus(); nameRef.current?.select(); } }, [props.focusName]);
  return (
    <div className="kx-screens-wrap">
      <aside className="kx-screens" data-testid="screens-panel">
        <p className="kx-label">Screens</p>
        {draft.menus.map((m, i) => (
          <button key={m.id} type="button" draggable data-testid="screens-panel-item" title="Drag to change the order"
            className={[m.id === activeId ? "active" : "", dragFrom === i ? "kx-dragging" : "", dropAt === i && dragFrom !== null ? "kx-drop-before" : "",
              dropAt === draft.menus.length && i === draft.menus.length - 1 && dragFrom !== null ? "kx-drop-after" : ""].filter(Boolean).join(" ")}
            onClick={() => props.onOpen(m.id)}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/kiosk-screen", m.id); setDragFrom(i); }}
            onDragOver={(e) => {
              if (dragFrom == null) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => { e.preventDefault(); drop(); }}
            onDragEnd={endDrag}>
            {m.name}
          </button>
        ))}
        <button type="button" className="kx-add" onClick={props.onNew} disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus} data-testid="screens-panel-new">
          <Plus size={16} /> New screen
        </button>
        {active && (
          <div className="kx-meta">
            <p className="kx-label">Screen name</p>
            <input ref={nameRef} value={active.name} maxLength={KIOSK_MENU_LIMITS.name} data-testid="screens-panel-name"
              onChange={(e) => props.onRename(active.id, e.target.value)} />
            <button type="button" className="kx-danger" data-testid="screens-panel-delete"
              onClick={() => { if (window.confirm(`Delete "${active.name || "this screen"}"? Buttons and tap spots that open it are removed too.`)) props.onDelete(active.id); }}>
              <Trash2 size={15} /> Delete screen
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
