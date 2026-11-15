/**
 * Kiosk Builder › the left Screens panel (owner, 2026-11-13: "exactly like" the /nail grid editor's Grids panel).
 * Screens not in a workflow first (the first screen, "What are you here for?"), then each workflow (owner,
 * 2026-11-15: Manicure, Pedicure, Fake nails…) as its own sub-menu holding its screens and its own "New screen".
 * A click opens a screen; a workflow's name opens or closes it and shows its name box. "New screen" makes one with
 * a temporary name ("Screen 3") and selects it to type over. Screens are dragged to change their order, or onto
 * another workflow to move them: on picture screens Continue goes to the next screen of the same workflow.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { KIOSK_MENU_LIMITS, KIOSK_WORKFLOW_LIMITS, type KioskLayout, type KioskMenu } from "@shared/kiosk/layout";
import "./screensPanel.css";

/** Where a dragged screen would land: in workflow `workflowId`, before `beforeId` (null: last in it). */
type DropTarget = { workflowId: string | null; beforeId: string | null; rowKey: string; after?: boolean };

export function ScreensPanel(props: {
  draft: KioskLayout;
  /** The screen open in the editor (null: none, e.g. on the Welcome tab). */
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: (workflowId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, workflowId: string | null, beforeId: string | null) => void;
  onNewWorkflow: () => string;
  onRenameWorkflow: (id: string, name: string) => void;
  onDeleteWorkflow: (id: string) => void;
  /** Bumped when a new screen is made: the name box takes the focus. */
  focusName: number;
}) {
  const { draft, activeId } = props;
  const active = draft.menus.find((m) => m.id === activeId) ?? null;
  const nameRef = useRef<HTMLInputElement>(null);
  const flowNameRef = useRef<HTMLInputElement>(null);
  // The workflow whose name box shows (its name was clicked), and which workflows are open.
  const [flowId, setFlowId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(draft.workflows.map((w) => w.id)));
  const flow = draft.workflows.find((w) => w.id === flowId) ?? null;
  // The open screen's workflow is always open.
  useEffect(() => {
    if (active?.workflowId && !open.has(active.workflowId)) setOpen((o) => new Set(o).add(active.workflowId!));
  }, [active?.workflowId, open]);
  // A new screen's temporary name is selected, so typing replaces it.
  // (After the render that swaps a workflow's name box for the screen's.)
  useEffect(() => {
    if (!props.focusName) return;
    setFlowId(null);
    const t = setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select(); }, 0);
    return () => clearTimeout(t);
  }, [props.focusName]);

  // Dragging a screen.
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const endDrag = () => { setDragId(null); setTarget(null); };
  const drop = () => {
    if (dragId && target) props.onMove(dragId, target.workflowId, target.beforeId);
    endDrag();
  };

  const screenRow = (m: KioskMenu, list: KioskMenu[], i: number, nested: boolean) => {
    const nextId = list[i + 1]?.id ?? null;
    const cls = [nested ? "kx-nested" : "", m.id === activeId && !flowId ? "active" : "", dragId === m.id ? "kx-dragging" : "",
      target?.rowKey === m.id ? (target.after ? "kx-drop-after" : "kx-drop-before") : ""].filter(Boolean).join(" ");
    return (
      <button key={m.id} type="button" draggable className={cls} title="Drag to change the order" data-testid="screens-panel-item"
        onClick={() => { setFlowId(null); props.onOpen(m.id); }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/kiosk-screen", m.id); setDragId(m.id); }}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const after = e.clientY >= r.top + r.height / 2;
          setTarget({ workflowId: m.workflowId, beforeId: after ? nextId : m.id, rowKey: m.id, after });
        }}
        onDrop={(e) => { e.preventDefault(); drop(); }}
        onDragEnd={endDrag}>
        {m.name}
      </button>
    );
  };
  const newScreenButton = (workflowId: string | null, nested: boolean) => (
    <button type="button" className={`kx-add${nested ? " kx-nested" : ""}`} onClick={() => props.onNew(workflowId)} disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus}
      data-testid={workflowId ? "screens-panel-new-in-flow" : "screens-panel-new"}
      onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setTarget({ workflowId, beforeId: null, rowKey: `add-${workflowId ?? "none"}` }); }}
      onDrop={(e) => { e.preventDefault(); drop(); }}>
      <Plus size={16} /> New screen
    </button>
  );
  const loose = draft.menus.filter((m) => !m.workflowId);

  return (
    <div className="kx-screens-wrap">
      <aside className="kx-screens" data-testid="screens-panel">
        <p className="kx-label">Screens</p>
        {loose.map((m, i) => screenRow(m, loose, i, false))}
        {newScreenButton(null, false)}

        <p className="kx-label kx-label-gap">Workflows</p>
        {draft.workflows.map((w) => {
          const list = draft.menus.filter((m) => m.workflowId === w.id);
          const isOpen = open.has(w.id);
          return (
            <div key={w.id} className="kx-flow" data-testid="screens-panel-flow">
              <button type="button" className={`kx-flow-head${flowId === w.id ? " active" : ""}${target?.rowKey === `flow-${w.id}` ? " kx-drop-into" : ""}`}
                data-testid="screens-panel-flow-head"
                onClick={() => {
                  setOpen((o) => { const n = new Set(o); if (n.has(w.id) && flowId === w.id) n.delete(w.id); else n.add(w.id); return n; });
                  setFlowId(w.id);
                }}
                onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setTarget({ workflowId: w.id, beforeId: null, rowKey: `flow-${w.id}` }); }}
                onDrop={(e) => { e.preventDefault(); drop(); }}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="kx-flow-name">{w.name}</span>
                <span className="kx-flow-count">{list.length}</span>
              </button>
              {isOpen && (
                <>
                  {list.map((m, i) => screenRow(m, list, i, true))}
                  {newScreenButton(w.id, true)}
                </>
              )}
            </div>
          );
        })}
        <button type="button" className="kx-add" disabled={draft.workflows.length >= KIOSK_WORKFLOW_LIMITS.workflows} data-testid="screens-panel-new-flow"
          onClick={() => {
            const id = props.onNewWorkflow();
            setOpen((o) => new Set(o).add(id)); setFlowId(id);
            setTimeout(() => { flowNameRef.current?.focus(); flowNameRef.current?.select(); }, 0);
          }}>
          <Plus size={16} /> New workflow
        </button>

        {flow ? (
          <div className="kx-meta">
            <p className="kx-label">Workflow name</p>
            <input ref={flowNameRef} value={flow.name} maxLength={KIOSK_WORKFLOW_LIMITS.name} data-testid="screens-panel-flow-name"
              onChange={(e) => props.onRenameWorkflow(flow.id, e.target.value)} />
            <button type="button" className="kx-danger" data-testid="screens-panel-flow-delete"
              onClick={() => {
                const n = draft.menus.filter((m) => m.workflowId === flow.id).length;
                if (!window.confirm(n ? `Delete the workflow "${flow.name}" and its ${n} ${n === 1 ? "screen" : "screens"}? Buttons and tap spots that open them are removed too.` : `Delete the workflow "${flow.name}"?`)) return;
                props.onDeleteWorkflow(flow.id); setFlowId(null);
              }}>
              <Trash2 size={15} /> Delete workflow
            </button>
          </div>
        ) : active && (
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
