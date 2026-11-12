import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { HaircutSpec } from "@shared/haircutFormula";
import {
  BEARD_GUARDS, BEARD_SHAPES, DIRECTIONS, FADE_TYPES, GUARDS, HEIGHTS, NECKLINES, SIDEBURN_LENGTHS, SIDEBURN_SHAPES, SIDE_TECHNIQUES,
  TOP_LENGTHS, TOP_TECHNIQUES, TOP_TEXTURES, checkDraft, compactSpec, draftFrom, sameCut, toggle, type Draft,
} from "./formulaDraft";
import { word } from "./formulaView";
import {
  createNamedFormula, getHistory, getVersionDetails, listFormulas, onceAtATime, saveKey, saveTicketFormula, saveToFormula, searchHairstyles,
  type Formula, type FormulaVersion, type Hairstyle,
} from "./haircutFormulaApi";
import { FormulaRows, useLastCut } from "./LastCutPanel";
import { salonTimeZone } from "@/lib/salonClock";
import { LcfPortal } from "./lcfSheet";
import "./lastCut.css";

/**
 * Last Cut Formula editor (Phase 3) — today's cut for one ticket, on a 10" touchscreen. Every section is optional;
 * the barber taps only what applies. "Repeat Last Cut" fills in the client's last cut to adjust; "History" shows the
 * earlier visits (any can be used as today's starting point). Saving sends the cut through the formula API:
 *   - the ticket's record (POST /api/haircut-formula/for-ticket/:id/versions; a name-only walk-in's cut too), or
 *   - a named formula of the client (POST /api/clients/:id/haircut-formula/versions with formulaId).
 * Saving again for the same ticket adds a correction (history keeps both). Tapping Save twice, or a retry after a
 * dropped connection, sends one request with one key, so the server keeps one version.
 */

type Style = { id: number; name: string; category?: string | null } | null;

export type SaveTarget = { appointmentId: number; clientId: number | null; formulaId: number | null };

/** The save action for one ticket: one request at a time, keyed by what is saved (see haircutFormulaApi saveKey). */
export function makeFormulaSaver(target: SaveTarget) {
  return onceAtATime(async (draft: Draft, style: Style): Promise<FormulaVersion> => {
    const spec: HaircutSpec = compactSpec(style ? { ...draft, style: { ...(draft.style ?? {}), templateId: style.id, name: style.name } } : draft);
    const checked = checkDraft(spec);
    if (!checked.ok) throw new Error(checked.message);
    const templateId = style?.id ?? null;
    const idempotencyKey = saveKey(`t${target.appointmentId}:f${target.formulaId ?? 0}`, { spec: checked.spec, templateId });
    const r = target.formulaId && target.clientId
      ? await saveToFormula(target.clientId, { formulaId: target.formulaId, appointmentId: target.appointmentId, spec: checked.spec, templateId, idempotencyKey })
      : await saveTicketFormula(target.appointmentId, { spec: checked.spec, templateId, idempotencyKey });
    return r.version;
  });
}

function Chips<T extends string | number>({ options, picked, onPick, label, testId, format = (v) => word(String(v)) }: {
  options: readonly T[]; picked: (v: T) => boolean; onPick: (v: T) => void; label: string; testId: string; format?: (v: T) => string;
}) {
  return (
    <div className="lcf-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o)} type="button" className={picked(o) ? "on" : ""} aria-pressed={picked(o)} onClick={() => onPick(o)} data-testid={`${testId}-${o}`}>{format(o)}</button>
      ))}
    </div>
  );
}

const Section = ({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) => (
  <section className="lcf-ed-section" data-testid={testId}><h3>{title}</h3>{children}</section>
);

/** The pickers (no loading, no saving): used by the editor, the tests and the screenshot harness. */
export function FormulaEditorFields({ draft, setDraft, beardOpen, setBeardOpen }: {
  draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; beardOpen: boolean; setBeardOpen: (v: boolean) => void;
}) {
  const fadeType = draft.fade?.type;
  const set = <K extends keyof Draft>(k: K, f: (cur: NonNullable<Draft[K]> | undefined) => Draft[K]) => setDraft((d) => ({ ...d, [k]: f(d[k] as any) }));
  const one = <T,>(cur: T | undefined, v: T) => (cur === v ? undefined : v); // tap again to clear
  return (
    <div className="lcf-ed-fields">
      <Section title="Sides · guard" testId="lcf-ed-sides">
        <Chips label="Sides guard" testId="lcf-ed-guard" options={GUARDS} format={(g) => (g === "foil" ? "Foil" : g)}
          picked={(g) => !!draft.sides?.guard?.includes(g)} onPick={(g) => set("sides", (s) => ({ ...s, guard: toggle(s?.guard, g) }))} />
        <Chips label="Sides technique" testId="lcf-ed-side-tech" options={SIDE_TECHNIQUES}
          picked={(t) => !!draft.sides?.technique?.includes(t)} onPick={(t) => set("sides", (s) => ({ ...s, technique: toggle(s?.technique, t) }))} />
      </Section>
      <Section title="Fade" testId="lcf-ed-fade">
        <Chips label="Fade type" testId="lcf-ed-fade-type" options={FADE_TYPES} format={(t) => (t === "none" ? "No fade" : word(t))}
          picked={(t) => fadeType === t} onPick={(t) => set("fade", (f) => ({ ...f, type: one(f?.type, t), ...(t === "none" ? { height: undefined } : {}) }))} />
        {fadeType && fadeType !== "none" && (
          <div className="lcf-sub" data-testid="lcf-ed-height">
            <span>Height</span>
            <Chips label="Fade height" testId="lcf-ed-fade-height" options={HEIGHTS}
              picked={(h) => draft.fade?.height === h} onPick={(h) => set("fade", (f) => ({ ...f, height: one(f?.height, h) }))} />
          </div>
        )}
      </Section>
      <Section title="Top" testId="lcf-ed-top">
        <Chips label="Top length" testId="lcf-ed-top-length" options={TOP_LENGTHS} format={(n) => `${n} in`}
          picked={(n) => draft.top?.length?.unit === "in" && draft.top.length.value === n}
          onPick={(n) => set("top", (t) => ({ ...t, length: t?.length?.unit === "in" && t.length.value === n ? undefined : { value: n, unit: "in" } }))} />
        <Chips label="Top technique" testId="lcf-ed-top-tech" options={TOP_TECHNIQUES}
          picked={(t) => !!draft.top?.technique?.includes(t)} onPick={(t) => set("top", (x) => ({ ...x, technique: toggle(x?.technique, t) }))} />
        <Chips label="Top texture" testId="lcf-ed-top-texture" options={TOP_TEXTURES}
          picked={(t) => !!draft.top?.texture?.includes(t)} onPick={(t) => set("top", (x) => ({ ...x, texture: toggle(x?.texture, t) }))} />
        <Chips label="Styling" testId="lcf-ed-top-dir" options={DIRECTIONS}
          picked={(d) => draft.top?.direction === d} onPick={(d) => set("top", (x) => ({ ...x, direction: one(x?.direction, d) }))} />
        <Chips label="Leave longer" testId="lcf-ed-top-longer" options={["leave-longer"] as const} format={() => "Leave longer"}
          picked={() => !!draft.top?.leaveLonger} onPick={() => set("top", (x) => ({ ...x, leaveLonger: !x?.leaveLonger || undefined }))} />
      </Section>
      <div className="lcf-ed-two">
        <Section title="Neckline" testId="lcf-ed-neckline">
          <Chips label="Neckline" testId="lcf-ed-neck" options={NECKLINES}
            picked={(n) => !!draft.neckline?.shape?.includes(n)} onPick={(n) => set("neckline", (x) => ({ shape: toggle(x?.shape, n) }))} />
        </Section>
        <Section title="Sideburns" testId="lcf-ed-sideburns">
          <Chips label="Sideburn length" testId="lcf-ed-sb-length" options={SIDEBURN_LENGTHS}
            picked={(l) => draft.sideburns?.length === l} onPick={(l) => set("sideburns", (x) => ({ ...x, length: one(x?.length, l) }))} />
          <Chips label="Sideburn shape" testId="lcf-ed-sb-shape" options={SIDEBURN_SHAPES}
            picked={(s) => !!draft.sideburns?.shape?.includes(s)} onPick={(s) => set("sideburns", (x) => ({ ...x, shape: toggle(x?.shape, s) }))} />
        </Section>
      </div>
      <Section title="Beard" testId="lcf-ed-beard">
        {!beardOpen && !draft.beard ? (
          <button type="button" className="lcf-btn lcf-btn-quiet" onClick={() => setBeardOpen(true)} data-testid="lcf-ed-beard-add">Add beard settings</button>
        ) : (
          <>
            <Chips label="Beard guard" testId="lcf-ed-beard-guard" options={BEARD_GUARDS}
              picked={(g) => draft.beard?.guard === g} onPick={(g) => set("beard", (b) => ({ ...b, guard: one(b?.guard, g) }))} />
            <Chips label="Beard shape" testId="lcf-ed-beard-shape" options={BEARD_SHAPES}
              picked={(s) => draft.beard?.shape === s} onPick={(s) => set("beard", (b) => ({ ...b, shape: one(b?.shape, s) }))} />
            <Chips label="Beard finish" testId="lcf-ed-beard-finish" options={["line-up", "blend"] as const} format={(o) => (o === "line-up" ? "Line up" : "Blend into fade")}
              picked={(o) => (o === "line-up" ? !!draft.beard?.lineUp : !!draft.beard?.blendIntoFade)}
              onPick={(o) => set("beard", (b) => (o === "line-up" ? { ...b, lineUp: !b?.lineUp || undefined } : { ...b, blendIntoFade: !b?.blendIntoFade || undefined }))} />
          </>
        )}
      </Section>
      <Section title="Notes" testId="lcf-ed-notes">
        <textarea className="lcf-notes" rows={3} maxLength={1000} value={draft.instructions ?? ""} placeholder="Optional — anything the next barber should know"
          onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, instructions: v || undefined })); }} data-testid="lcf-ed-notes-input" />
      </Section>
    </div>
  );
}

function HairstylePicker({ style, onPick }: { style: Style; onPick: (s: Style) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hairstyle[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => { searchHairstyles(q).then((r) => { if (live) setResults(r.hairstyles); }, () => { if (live) setResults([]); }); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);
  return (
    <div className="lcf-style-pick" data-testid="lcf-ed-style">
      {style && !open ? (
        <div className="lcf-style-chosen">
          <strong>{style.name}</strong>
          <button type="button" className="lcf-btn lcf-btn-quiet" onClick={() => setOpen(true)}>Change</button>
          <button type="button" className="lcf-btn lcf-btn-quiet" onClick={() => onPick(null)}>Remove</button>
        </div>
      ) : open ? (
        <>
          <input className="lcf-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hairstyles (e.g. mid fade, crop)" data-testid="lcf-ed-style-search" />
          <div className="lcf-chips lcf-style-results">
            {results.map((h) => <button key={h.id} type="button" onClick={() => { onPick({ id: h.id, name: h.name, category: h.category.name }); setOpen(false); }}>{h.name}<small>{h.scope === "store" ? " · this shop" : ""}</small></button>)}
            {results.length === 0 && <p className="lcf-muted">No styles found.</p>}
          </div>
          <button type="button" className="lcf-btn lcf-btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
        </>
      ) : (
        <button type="button" className="lcf-btn" onClick={() => setOpen(true)} data-testid="lcf-ed-style-open">Select hairstyle</button>
      )}
    </div>
  );
}

function HistorySheet({ clientId, onUse, onClose }: { clientId: number; onUse: (v: FormulaVersion) => void; onClose: () => void }) {
  const [list, setList] = useState<FormulaVersion[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ record: FormulaVersion; current: FormulaVersion; corrections: FormulaVersion[] } | null>(null);
  useEffect(() => { getHistory(clientId, { limit: 30 }).then((r) => setList(r.versions), (e) => setError(e?.message || "Could not load the history.")); }, [clientId]);
  const show = (v: FormulaVersion) => getVersionDetails(v.id).then((d) => setOpen(d), (e) => setError(e?.message || "Could not load that visit."));
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: salonTimeZone(), month: "short", day: "numeric", year: "numeric" });
  return (
    <LcfPortal>
    <div className="lcf-sheet" role="dialog" aria-modal="true" aria-label="Previous haircuts" data-testid="lcf-history" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="lcf-sheet-card lcf-history" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lcf-close" onClick={onClose} aria-label="Close"><X size={28} /></button>
        <h2 className="lcf-sheet-title">Previous haircuts</h2>
        {error && <p className="lcf-error" role="alert">{error}</p>}
        <div className="lcf-history-grid">
          <ul className="lcf-history-list">
            {list === null && !error && <li className="lcf-muted">Loading…</li>}
            {list?.length === 0 && <li className="lcf-muted">No earlier visits saved.</li>}
            {list?.map((v) => (
              <li key={v.id}>
                <button type="button" className={open?.current.id === v.id ? "on" : ""} onClick={() => void show(v)} data-testid="lcf-history-item">
                  <strong>{when(v.visitAt)}</strong><span>{[v.hairstyleName, v.staffName].filter(Boolean).join(" · ") || "Haircut"}{v.corrected ? " · corrected" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="lcf-history-detail">
            {open ? (
              <>
                <p className="lcf-meta">{when(open.current.visitAt)}{open.corrections.length ? <span>{` · ${open.corrections.length} correction${open.corrections.length === 1 ? "" : "s"}`}</span> : null}</p>
                <FormulaRows version={open.current} />
                <button type="button" className="lcf-btn lcf-btn-primary" onClick={() => onUse(open.current)} data-testid="lcf-history-use">Use for today's cut</button>
              </>
            ) : <p className="lcf-muted">Tap a visit to see its formula.</p>}
          </div>
        </div>
      </div>
    </div>
    </LcfPortal>
  );
}

export function FormulaEditor({ appointmentId, clientId, clientName, onClose, onSaved }: {
  appointmentId: number; clientId: number | null; clientName?: string | null;
  onClose: () => void; onSaved?: (v: FormulaVersion) => void;
}) {
  const cid = Number(clientId) > 0 ? Number(clientId) : null;
  const { state } = useLastCut({ clientId: cid, appointmentId });
  const ready = state.status === "ready" ? state : null;
  const [draft, setDraftState] = useState<Draft>(draftFrom(null));
  const [style, setStyle] = useState<Style>(null);
  const [beardOpen, setBeardOpen] = useState(false);
  const [formulaId, setFormulaId] = useState<number | null>(null);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [newName, setNewName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<FormulaVersion | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(false);
  const started = useRef(false);

  // Start from today's record if one is saved (editing it becomes a correction), else empty.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    if (ready.today) { load(ready.today); setSaved(ready.today); }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cid) return;
    let live = true;
    listFormulas(cid).then((r) => { if (live) setFormulas(r.formulas); }, () => {});
    return () => { live = false; };
  }, [cid]);

  const setDraft = (f: (d: Draft) => Draft) => { setDraftState(f); setError(""); };
  const load = (v: FormulaVersion) => {
    setDraftState(draftFrom(v.spec)); setError("");
    setStyle(v.templateId ? { id: v.templateId, name: v.hairstyleName ?? v.spec.style?.name ?? "Hairstyle" } : null);
    setBeardOpen(!!v.spec.beard);
  };
  const saver = useMemo(() => makeFormulaSaver({ appointmentId, clientId: cid, formulaId }), [appointmentId, cid, formulaId]);
  const check = checkDraft(style ? { ...draft, style: { templateId: style.id, name: style.name } } : draft);
  const unchanged = !!saved && sameCut(saved.spec, compactSpec(style ? { ...draft, style: { ...(draft.style ?? {}), templateId: style.id, name: style.name } } : draft)) && (saved.templateId ?? null) === (style?.id ?? null);

  const save = async () => {
    if (saving || unchanged) return;
    setSaving(true); setError("");
    try {
      const v = await saver(draft, style);
      setSaved(v);
      onSaved?.(v);
    } catch (e: any) {
      setError(e?.message || "Could not save the haircut. Check the connection and tap Save again.");
    } finally { setSaving(false); }
  };
  const addNamed = async () => {
    const label = (newName ?? "").trim();
    if (!cid || !label) return;
    try {
      const r = await createNamedFormula(cid, label);
      setFormulas((f) => [...f, r.formula]); setFormulaId(r.formula.isDefault ? null : r.formula.id); setNewName(null);
    } catch (e: any) { setError(e?.message || "Could not add the formula."); }
  };

  return (
    <LcfPortal>
    <div className="lcf-sheet lcf-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="lcf-ed-title" data-testid="lcf-editor" onClick={(e) => e.stopPropagation()}>
      <div className="lcf-sheet-card lcf-editor">
        <header className="lcf-ed-head">
          <div>
            <h2 id="lcf-ed-title" className="lcf-sheet-title">Today's cut</h2>
            <p className="lcf-muted">{clientName?.trim() || "Walk-in"}{!cid ? " · name only — saved on this ticket" : ""}</p>
          </div>
          <div className="lcf-ed-tools">
            <button type="button" className="lcf-btn" disabled={!ready?.latest} onClick={() => ready?.latest && load(ready.latest)} data-testid="lcf-ed-repeat">Repeat Last Cut</button>
            {cid && <button type="button" className="lcf-btn" onClick={() => setHistory(true)} data-testid="lcf-ed-history">History</button>}
            <button type="button" className="lcf-close lcf-close-inline" onClick={onClose} aria-label="Close"><X size={28} /></button>
          </div>
        </header>

        <div className="lcf-ed-scroll">
          {state.status === "error" && <p className="lcf-error" role="alert">{state.message}</p>}
          <Section title="Hairstyle" testId="lcf-ed-style-section"><HairstylePicker style={style} onPick={(s) => { setStyle(s); setError(""); }} /></Section>
          {cid && (
            <Section title="Save to" testId="lcf-ed-target">
              <div className="lcf-chips">
                {formulas.filter((f) => !f.isArchived).map((f) => (
                  <button key={f.id} type="button" className={(formulaId ?? formulas.find((x) => x.isDefault)?.id) === f.id ? "on" : ""} onClick={() => setFormulaId(f.isDefault ? null : f.id)}>{f.isDefault ? "Everyday" : f.label}</button>
                ))}
                {newName === null
                  ? <button type="button" onClick={() => setNewName("")} data-testid="lcf-ed-new-formula">+ Named formula</button>
                  : <span className="lcf-new-formula"><input value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Summer cut" /><button type="button" onClick={() => void addNamed()}>Add</button></span>}
              </div>
            </Section>
          )}
          <FormulaEditorFields draft={draft} setDraft={setDraft} beardOpen={beardOpen} setBeardOpen={setBeardOpen} />
        </div>

        <footer className="lcf-ed-foot">
          {error && <p className="lcf-error" role="alert" data-testid="lcf-ed-error">{error}</p>}
          {!error && !check.ok && <p className="lcf-muted">{check.message}</p>}
          <button type="button" className="lcf-btn lcf-btn-ghost" onClick={onClose} data-testid="lcf-ed-close">{saved ? "Done" : "Cancel"}</button>
          <button type="button" className="lcf-btn lcf-btn-primary lcf-save" disabled={saving || unchanged || !check.ok} onClick={() => void save()} data-testid="lcf-ed-save">
            {saving ? "Saving…" : unchanged ? "Saved" : saved ? "Save changes" : "Save haircut"}
          </button>
        </footer>
      </div>
      {history && cid && <HistorySheet clientId={cid} onClose={() => setHistory(false)} onUse={(v) => { load(v); setHistory(false); }} />}
    </div>
    </LcfPortal>
  );
}
