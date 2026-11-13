/**
 * Kiosk Builder › the left Screens panel (owner, 2026-11-13: "exactly like" the /nail grid editor's Grids panel).
 * Lists the configuration's own screens; a click opens one in the editor. "New screen" adds a blank one, opens it
 * and asks for its name; the name box and Delete screen work on the open screen.
 */
import { useEffect, useRef } from "react";
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
  /** Bumped when a new screen is made: the name box takes the focus. */
  focusName: number;
}) {
  const { draft, activeId } = props;
  const active = draft.menus.find((m) => m.id === activeId) ?? null;
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (props.focusName) nameRef.current?.focus(); }, [props.focusName]);
  return (
    <div className="kx-screens-wrap">
      <aside className="kx-screens" data-testid="screens-panel">
        <p className="kx-label">Screens</p>
        {draft.menus.map((m) => (
          <button key={m.id} type="button" className={m.id === activeId ? "active" : ""} onClick={() => props.onOpen(m.id)} data-testid="screens-panel-item">
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
