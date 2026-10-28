import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { POS_FN_LABELS, POS_FNS, POS_GRID_MAIN, POS_GRID_MAX_GRIDS, POS_GRID_ROWS, POS_GRID_SLOTS, posGridColumns, posGridSlots, type PosAfter, type PosFn, type PosGrid, type PosGridConfig, type PosKey } from "@shared/posGrid";
import { arrangedKeys, autoPlacedSlots, PosKeyButton, ROW_BANDS, type CatalogAddon, type CatalogGroup } from "./CatalogPanel";

/** The automatic layout as an arranged one — where a manager starts from the first time: a key per category. */
export function automaticLayout(groups: CatalogGroup[]): PosGridConfig {
  const keys: (PosKey | null)[] = Array.from({ length: POS_GRID_SLOTS }, (_, i) => (groups[i] ? { type: "category", groupKey: groups[i].key } : null));
  return { grids: [{ id: POS_GRID_MAIN, name: "Main", keys }] };
}

const KEY_TYPES: { type: "empty" | PosKey["type"]; label: string }[] = [
  { type: "empty", label: "Empty" }, { type: "category", label: "Category" }, { type: "service", label: "Service" }, { type: "addon", label: "Add-on" },
  { type: "grid", label: "Grid" }, { type: "fn", label: "Function" }, { type: "back", label: "Back" },
];

const AFTER_OPTIONS: { to: PosAfter["to"]; label: string }[] = [{ to: "stay", label: "Stay here" }, { to: "main", label: "Back to main" }, { to: "grid", label: "Open a grid" }];

/**
 * The manager's key grid editor: choose a grid on the left, tap a position in the middle, and say on the
 * right what that key is — a category (opens its services), one service, another grid, or Back — with an
 * optional name of their own and band colour. Nothing reaches the POS until Save.
 */
export function GridEditor({ groups: allGroups, addons = [], config, saving, onSave, onClose }: {
  groups: CatalogGroup[];
  /** Every active add-on, for add-on keys. */
  addons?: CatalogAddon[];
  /** The saved layout, or null while the POS is on the automatic one. */
  config: PosGridConfig | null;
  saving: boolean;
  /** null = go back to the automatic layout. */
  onSave: (config: PosGridConfig | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PosGridConfig>(() => config ?? automaticLayout(allGroups));
  // The automatic Add-ons key can be switched off: it then isn't placed on the grid by itself.
  const groups = useMemo(() => (draft.hideAddonsKey ? allGroups.filter((g) => g.key !== "addons") : allGroups), [allGroups, draft.hideAddonsKey]);
  const [gridId, setGridId] = useState<string>(POS_GRID_MAIN);
  const [slot, setSlot] = useState<number | null>(null);
  const grid = draft.grids.find((g) => g.id === gridId) ?? draft.grids[0];
  const isMain = grid.id === POS_GRID_MAIN;
  const keys = useMemo(() => arrangedKeys(grid, draft, groups, addons), [grid, draft, groups, addons]);
  const autoSlots = useMemo(() => (isMain ? autoPlacedSlots(draft, groups, addons) : new Set<number>()), [isMain, draft, groups, addons]);
  const current = slot != null ? grid.keys[slot] ?? null : null;
  const otherGrids = draft.grids.filter((g) => g.id !== POS_GRID_MAIN && g.id !== grid.id);

  const changeGrid = (id: string, change: (g: PosGrid) => PosGrid) =>
    setDraft((d) => ({ ...d, grids: d.grids.map((g) => (g.id === id ? change(g) : g)) }));
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
    if (type === "addon") return addons[0] ? setKey({ type, addonId: addons[0].id, ...look }) : undefined;
    if (type === "fn") return setKey({ type, fn: POS_FNS[0], ...look });
    return setKey({ type: "back", ...look });
  };
  const patch = (change: Partial<PosKey>) => { if (current) setKey({ ...current, ...change } as PosKey); };
  const addGrid = () => {
    if (draft.grids.length >= POS_GRID_MAX_GRIDS) return;
    const id = `g${Date.now().toString(36)}`;
    setDraft((d) => ({ ...d, grids: [...d.grids, { id, name: "New grid", keys: Array.from({ length: posGridSlots(d) }, () => null) }] }));
    setGridId(id); setSlot(null);
  };
  const deleteGrid = () => {
    if (isMain || !window.confirm(`Delete the grid "${grid.name}"? Keys that open it become empty.`)) return;
    setDraft((d) => ({
      ...d,
      grids: d.grids.filter((g) => g.id !== grid.id).map((g) => ({ ...g, keys: g.keys.map((k) => (k?.type === "grid" && k.gridId === grid.id ? null : k)) })),
    }));
    setGridId(POS_GRID_MAIN); setSlot(null);
  };
  const defaultName = !current ? ""
    : current.type === "category" ? groups.find((g) => g.key === current.groupKey)?.name ?? "Category"
    : current.type === "service" ? groups.flatMap((g) => g.services).find((sv) => sv.id === current.serviceId)?.name ?? "Service"
    : current.type === "grid" ? draft.grids.find((g) => g.id === current.gridId)?.name ?? "Grid"
    : current.type === "addon" ? addons.find((a) => a.id === current.addonId)?.name ?? "Add-on"
    : current.type === "fn" ? POS_FN_LABELS[current.fn] : "Back";
  // Grid size: 2 or 3 keys across, 6 rows (owner, 2026-10-24). Going down to 2 drops the third column's keys, after a warning.
  const columns = posGridColumns(draft);
  const setColumns = (next: 2 | 3) => {
    if (next === columns) return;
    const slots = next * POS_GRID_ROWS;
    if (next === 2 && draft.grids.some((g) => g.keys.slice(slots).some((k) => k != null))
      && !window.confirm("Go to 2 across? Keys in positions 13–18 are taken off.")) return;
    setDraft((d) => {
      const { columns: _old, ...rest } = d;
      const grids = d.grids.map((g) => ({ ...g, keys: Array.from({ length: slots }, (_, i) => g.keys[i] ?? null) }));
      return next === 3 ? { ...rest, grids, columns: 3 } : { ...rest, grids };
    });
    setSlot(null);
  };
  // After a service or add-on is picked on this grid (or, for the categories' own grids, on any of them).
  const jumpTargets = draft.grids.filter((g) => g.id !== POS_GRID_MAIN);
  const setAfter = (target: "grid" | "categories", next: PosAfter) => {
    const clean = next.to === "stay" ? undefined : next;
    if (target === "categories") setDraft((d) => { const { afterService: _old, ...rest } = d; return clean ? { ...rest, afterService: clean } : rest; });
    else changeGrid(grid.id, (g) => { const { after: _old, ...rest } = g; return clean ? { ...rest, after: clean } : rest; });
  };
  const afterPicker = (target: "grid" | "categories", value: PosAfter | undefined, self: string | null) => {
    const v = value ?? { to: "stay" as const };
    const targets = jumpTargets.filter((g) => g.id !== self);
    return (
      <div className="ge-field">
        <div className="ge-types">
          {AFTER_OPTIONS.filter((o) => o.to !== "main" || self !== POS_GRID_MAIN).map((o) => (
            <button key={o.to} type="button" className={v.to === o.to ? "active" : ""} disabled={o.to === "grid" && targets.length === 0}
              onClick={() => setAfter(target, o.to === "grid" ? { to: "grid", gridId: targets[0].id } : { to: o.to } as PosAfter)}
              data-testid={`nail-grid-after-${target}-${o.to}`}>{o.label}</button>
          ))}
        </div>
        {v.to === "grid" && (
          <select value={v.gridId} onChange={(e) => setAfter(target, { to: "grid", gridId: e.target.value })} data-testid={`nail-grid-after-${target}-target`}>
            {targets.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>
    );
  };

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
          <div className="ge-grid-meta">
            <p className="ge-label">Grid size</p>
            <div className="ge-types">
              {([2, 3] as const).map((c) => (
                <button key={c} type="button" className={columns === c ? "active" : ""} onClick={() => setColumns(c)} data-testid={`nail-grid-cols-${c}`}>{c} × 6</button>
              ))}
            </div>
            <p className="ge-label">Add-ons key</p>
            <div className="ge-types">
              <button type="button" className={!draft.hideAddonsKey ? "active" : ""} data-testid="nail-grid-addons-show"
                onClick={() => setDraft(({ hideAddonsKey: _h, ...rest }) => rest)}>Show</button>
              <button type="button" className={draft.hideAddonsKey ? "active" : ""} data-testid="nail-grid-addons-hide"
                onClick={() => setDraft((d) => ({ ...d, hideAddonsKey: true }))}>Hide</button>
            </div>
            <p className="ge-label">After a service or add-on on this grid</p>
            {afterPicker("grid", grid.after, grid.id)}
            <p className="ge-label">After a service in a category</p>
            {afterPicker("categories", draft.afterService, null)}
          </div>
        </aside>

        <section className="ge-preview">
          <div className="pos-grid" data-cols={columns}>
            {keys.map((k, i) => <PosKeyButton key={i} k={k} index={i} columns={columns} selected={slot === i} onClick={() => setSlot(i)} testId={`nail-grid-slot-${i}`} />)}
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
                    disabled={(t.type === "grid" && otherGrids.length === 0) || (t.type === "category" && groups.length === 0) || (t.type === "addon" && addons.length === 0)} data-testid={`nail-grid-type-${t.type}`}>{t.label}</button>
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
                    {groups.filter((g) => g.services.length > 0).map((g) => (
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
              {current?.type === "addon" && (
                <label className="ge-field"><span>Add-on</span>
                  <select value={current.addonId} onChange={(e) => patch({ addonId: Number(e.target.value) } as Partial<PosKey>)} data-testid="nail-grid-target">
                    {addons.map((a) => <option key={a.id} value={a.id}>{a.name} · +${Number(a.price).toFixed(2)}</option>)}
                  </select>
                </label>
              )}
              {current?.type === "fn" && (
                <label className="ge-field"><span>Function</span>
                  <select value={current.fn} onChange={(e) => patch({ fn: e.target.value as PosFn } as Partial<PosKey>)} data-testid="nail-grid-target">
                    {POS_FNS.map((f) => <option key={f} value={f}>{POS_FN_LABELS[f]}</option>)}
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
                      <label className={`ge-swatch ge-swatch-custom ${current.color && !ROW_BANDS.includes(current.color) ? "active" : ""}`}
                        style={current.color && !ROW_BANDS.includes(current.color) ? { background: current.color } : undefined} aria-label="Any colour">
                        <input type="color" value={current.color ?? "#ffffff"} onChange={(e) => patch({ color: e.target.value.toLowerCase() })} data-testid="nail-grid-color-custom" />
                      </label>
                    </div>
                  </div>
                </>
              ) : autoSlots.has(slot) ? (
                <p className="ge-hint">This position is empty, so the POS shows a category that isn't on any grid here. Choose a key to put something else here.</p>
              ) : <p className="ge-hint">This position is empty. Choose what the key is above.</p>}
              {!isMain && <p className="ge-hint">A grid with no Back key gets one in its last position on the POS.</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
