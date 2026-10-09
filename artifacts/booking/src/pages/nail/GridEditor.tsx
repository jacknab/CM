import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { POS_GRID_MAIN, POS_GRID_MAX_GRIDS, POS_GRID_SLOTS, type PosGrid, type PosGridConfig, type PosKey } from "@shared/posGrid";
import { arrangedKeys, PosKeyButton, ROW_BANDS, type CatalogGroup } from "./CatalogPanel";

/** The automatic layout as an arranged one — where a manager starts from the first time: a key per category. */
export function automaticLayout(groups: CatalogGroup[]): PosGridConfig {
  const keys: (PosKey | null)[] = Array.from({ length: POS_GRID_SLOTS }, (_, i) => (groups[i] ? { type: "category", groupKey: groups[i].key } : null));
  return { grids: [{ id: POS_GRID_MAIN, name: "Main", keys }] };
}

const KEY_TYPES: { type: "empty" | PosKey["type"]; label: string }[] = [
  { type: "empty", label: "Empty" }, { type: "category", label: "Category" }, { type: "service", label: "Service" }, { type: "grid", label: "Grid" }, { type: "back", label: "Back" },
];

/**
 * The manager's key grid editor: choose a grid on the left, tap a position in the middle, and say on the
 * right what that key is — a category (opens its services), one service, another grid, or Back — with an
 * optional name of their own and band colour. Nothing reaches the POS until Save.
 */
export function GridEditor({ groups, config, saving, onSave, onClose }: {
  groups: CatalogGroup[];
  /** The saved layout, or null while the POS is on the automatic one. */
  config: PosGridConfig | null;
  saving: boolean;
  /** null = go back to the automatic layout. */
  onSave: (config: PosGridConfig | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PosGridConfig>(() => config ?? automaticLayout(groups));
  const [gridId, setGridId] = useState<string>(POS_GRID_MAIN);
  const [slot, setSlot] = useState<number | null>(null);
  const grid = draft.grids.find((g) => g.id === gridId) ?? draft.grids[0];
  const isMain = grid.id === POS_GRID_MAIN;
  const keys = useMemo(() => arrangedKeys(grid, draft, groups), [grid, draft, groups]);
  const current = slot != null ? grid.keys[slot] ?? null : null;
  const otherGrids = draft.grids.filter((g) => g.id !== POS_GRID_MAIN && g.id !== grid.id);

  const changeGrid = (id: string, change: (g: PosGrid) => PosGrid) =>
    setDraft((d) => ({ grids: d.grids.map((g) => (g.id === id ? change(g) : g)) }));
  const setKey = (key: PosKey | null) => {
    if (slot == null) return;
    changeGrid(grid.id, (g) => ({ ...g, keys: g.keys.map((k, i) => (i === slot ? key : k)) }));
  };
  // Changing what a key is keeps the name and colour the manager gave it.
  const setType = (type: "empty" | PosKey["type"]) => {
    const look = current ? { ...(current.label ? { label: current.label } : {}), ...(current.color ? { color: current.color } : {}) } : {};
    if (type === "empty") return setKey(null);
    if (type === "category") return groups[0] ? setKey({ type, groupKey: groups[0].key, ...look }) : undefined;
    if (type === "service") { const first = groups.find((g) => g.services.length > 0)?.services[0]; return first ? setKey({ type, serviceId: first.id, ...look }) : undefined; }
    if (type === "grid") return otherGrids[0] ? setKey({ type, gridId: otherGrids[0].id, ...look }) : undefined;
    return setKey({ type: "back", ...look });
  };
  const patch = (change: Partial<PosKey>) => { if (current) setKey({ ...current, ...change } as PosKey); };
  const addGrid = () => {
    if (draft.grids.length >= POS_GRID_MAX_GRIDS) return;
    const id = `g${Date.now().toString(36)}`;
    setDraft((d) => ({ grids: [...d.grids, { id, name: "New grid", keys: Array.from({ length: POS_GRID_SLOTS }, () => null) }] }));
    setGridId(id); setSlot(null);
  };
  const deleteGrid = () => {
    if (isMain || !window.confirm(`Delete the grid "${grid.name}"? Keys that open it become empty.`)) return;
    setDraft((d) => ({
      grids: d.grids.filter((g) => g.id !== grid.id).map((g) => ({ ...g, keys: g.keys.map((k) => (k?.type === "grid" && k.gridId === grid.id ? null : k)) })),
    }));
    setGridId(POS_GRID_MAIN); setSlot(null);
  };
  const defaultName = !current ? ""
    : current.type === "category" ? groups.find((g) => g.key === current.groupKey)?.name ?? "Category"
    : current.type === "service" ? groups.flatMap((g) => g.services).find((sv) => sv.id === current.serviceId)?.name ?? "Service"
    : current.type === "grid" ? draft.grids.find((g) => g.id === current.gridId)?.name ?? "Grid" : "Back";

  return (
    <div className="ge-overlay" data-testid="nail-grid-editor">
      <header className="ge-head">
        <div>
          <h2>Key grid</h2>
          <p>Choose a grid, tap a position, then say what that key is. Nothing changes on the POS until you save.</p>
        </div>
        <div className="ge-head-actions">
          <button type="button" disabled={saving} onClick={() => { if (window.confirm("Go back to the automatic layout? The POS will show a key for every category again, and this arrangement is deleted.")) onSave(null); }} data-testid="nail-grid-auto">Automatic layout</button>
          <button type="button" disabled={saving} onClick={onClose} data-testid="nail-grid-cancel">Cancel</button>
          <button type="button" className="ge-save" disabled={saving} onClick={() => onSave(draft)} data-testid="nail-grid-save">{saving ? "Saving…" : "Save"}</button>
        </div>
      </header>

      <div className="ge-body">
        <aside className="ge-grids">
          <p className="ge-label">Grids</p>
          {draft.grids.map((g) => (
            <button key={g.id} type="button" className={g.id === grid.id ? "active" : ""} onClick={() => { setGridId(g.id); setSlot(null); }} data-testid={`nail-grid-pick-${g.id}`}>{g.name}</button>
          ))}
          <button type="button" className="ge-add" onClick={addGrid} disabled={draft.grids.length >= POS_GRID_MAX_GRIDS} data-testid="nail-grid-new"><Plus size={16} /> New grid</button>
          {!isMain && (
            <div className="ge-grid-meta">
              <p className="ge-label">Grid name</p>
              <input value={grid.name} maxLength={28} onChange={(e) => changeGrid(grid.id, (g) => ({ ...g, name: e.target.value }))} data-testid="nail-grid-name" />
              <button type="button" className="ge-danger" onClick={deleteGrid} data-testid="nail-grid-delete"><Trash2 size={15} /> Delete grid</button>
            </div>
          )}
        </aside>

        <section className="ge-preview">
          <div className="pos-grid">
            {keys.map((k, i) => <PosKeyButton key={i} k={k} index={i} selected={slot === i} onClick={() => setSlot(i)} testId={`nail-grid-slot-${i}`} />)}
          </div>
        </section>

        <aside className="ge-form">
          {slot == null ? (
            <p className="ge-hint">Tap a position in the grid to set its key.</p>
          ) : (
            <>
              <div className="ge-form-head"><p className="ge-label">Position {slot + 1}</p><button type="button" onClick={() => setSlot(null)} aria-label="Close"><X size={16} /></button></div>
              <div className="ge-types">
                {KEY_TYPES.filter((t) => t.type !== "back" || !isMain).map((t) => (
                  <button key={t.type} type="button" className={(current?.type ?? "empty") === t.type ? "active" : ""} onClick={() => setType(t.type)}
                    disabled={(t.type === "grid" && otherGrids.length === 0) || (t.type === "category" && groups.length === 0)} data-testid={`nail-grid-type-${t.type}`}>{t.label}</button>
                ))}
              </div>
              {current?.type === "category" && (
                <label className="ge-field"><span>Category</span>
                  <select value={current.groupKey} onChange={(e) => patch({ groupKey: e.target.value } as Partial<PosKey>)} data-testid="nail-grid-target">
                    {groups.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
                  </select>
                </label>
              )}
              {current?.type === "service" && (
                <label className="ge-field"><span>Service</span>
                  <select value={current.serviceId} onChange={(e) => patch({ serviceId: Number(e.target.value) } as Partial<PosKey>)} data-testid="nail-grid-target">
                    {groups.map((g) => (
                      <optgroup key={g.key} label={g.name}>
                        {g.services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name} · ${Number(sv.price).toFixed(2)}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              {current?.type === "grid" && (
                <label className="ge-field"><span>Opens</span>
                  <select value={current.gridId} onChange={(e) => patch({ gridId: e.target.value } as Partial<PosKey>)} data-testid="nail-grid-target">
                    {otherGrids.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
              )}
              {current ? (
                <>
                  <label className="ge-field"><span>Name on the key</span>
                    <input value={current.label ?? ""} maxLength={28} placeholder={defaultName} onChange={(e) => patch({ label: e.target.value || undefined })} data-testid="nail-grid-label" />
                  </label>
                  <div className="ge-field"><span>Band colour</span>
                    <div className="ge-swatches">
                      <button type="button" className={!current.color ? "active" : ""} onClick={() => patch({ color: undefined })} data-testid="nail-grid-color-row">Row colour</button>
                      {ROW_BANDS.map((c) => (
                        <button key={c} type="button" className={`ge-swatch ${current.color === c ? "active" : ""}`} style={{ background: c }} onClick={() => patch({ color: c })} aria-label={`Band colour ${c}`} data-testid={`nail-grid-color-${c.slice(1)}`} />
                      ))}
                    </div>
                  </div>
                </>
              ) : <p className="ge-hint">This position is empty. Choose what the key is above.</p>}
              {!isMain && <p className="ge-hint">A grid with no Back key gets one in its last position on the POS.</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
