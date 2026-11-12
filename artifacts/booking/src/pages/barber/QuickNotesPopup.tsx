import { useEffect, useState } from "react";
import { quickNoteLists, toggleQuickNoteOption, type QuickNoteField } from "@shared/quickNotes";
import { takeRepeatFormula } from "./repeatFormula";
import { useFormulasEnabled } from "./haircutFormulaApi";
import { FormulaEditor } from "./FormulaEditor";
import "./lastCut.css";

/**
 * Quick Notes (owner, 2026-11-11; server routes/quickNotes.ts): once a ticket with a client is checked out, a one-screen
 * note on how they like it: the business type's choices, all optional, and an optional line of the tech's own words.
 * The services come from the ticket and are only shown. Certxa writes the note in sentences and keeps it with the
 * client. A ticket with only a name (no client), or no connection, skips straight on.
 * Barbershops (owner, 2026-11-12): every section is multi-select with conflict rules (toggleQuickNoteOption), and
 * "Repeat Last Cut" fills in the client's previous picks (also done on open after "Repeat Formula" on their card).
 * Last Cut Formula on (HAIRCUT_FORMULAS, Phase 3): unchanged, plus "Full haircut formula" for a barbershop/haircut
 * note, which opens the formula editor for this ticket; saving there finishes this step. Saving Quick Notes itself
 * also keeps the haircut in the formula history (server side), so nothing is entered twice.
 */
type Field = QuickNoteField;
type Choices = Record<string, string | string[]>;
type Visit = {
  available: boolean; template: { id: string; fields: Field[] }; clientId: number | null; clientName: string | null; staffName: string | null;
  services: string[]; previous: { choices: unknown; extra?: string } | null;
};

/** The previous visit's picks, as this template's choices (older one-pick notes included). */
function previousChoices(v: Visit): Choices {
  if (!v.previous) return {};
  const lists = quickNoteLists(v.previous.choices) as Record<string, string[]>;
  const src = (v.previous.choices && typeof v.previous.choices === "object" ? v.previous.choices : {}) as Record<string, unknown>;
  const out: Choices = {};
  for (const f of v.template.fields) {
    const picked = (lists[f.key] ?? (Array.isArray(src[f.key]) ? (src[f.key] as string[]) : typeof src[f.key] === "string" ? [src[f.key] as string] : []))
      .filter((o) => f.options.includes(o));
    if (!picked.length) continue;
    out[f.key] = f.multi ? picked : picked[0];
  }
  return out;
}

export function QuickNotesPopup({ appointmentId, onDone }: { appointmentId: number; onDone: () => void }) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formulas = useFormulasEnabled() === true;
  const [fullEditor, setFullEditor] = useState(false);
  const [editorSaved, setEditorSaved] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/quick-notes/appointment/${appointmentId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: Visit | null) => {
        if (!live) return;
        if (!v?.available) { onDone(); return; }
        setVisit(v);
        if (takeRepeatFormula(v.clientId)) setChoices(previousChoices(v)); // "Repeat Formula" tapped on their card
      })
      .catch(() => { if (live) onDone(); });
    return () => { live = false; };
  }, [appointmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visit) return null;

  const pick = (f: Field, option: string) => setChoices((c) => {
    if (f.multi) {
      const now = Array.isArray(c[f.key]) ? (c[f.key] as string[]) : [];
      return { ...c, [f.key]: toggleQuickNoteOption(f, now, option) }; // "No Fade" clears fades, a fade clears "No Fade", …
    }
    return { ...c, [f.key]: c[f.key] === option ? "" : option }; // tap again to clear
  });
  const isPicked = (f: Field, option: string) => (f.multi ? Array.isArray(choices[f.key]) && (choices[f.key] as string[]).includes(option) : choices[f.key] === option);
  const anything = Object.values(choices).some((v) => (Array.isArray(v) ? v.length > 0 : !!v)) || !!extra.trim();

  const save = async () => {
    if (!anything || saving) return;
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/quick-notes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, choices, extra: extra.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Could not save the note.");
      onDone();
    } catch (e: any) {
      setError(e?.message || "Could not save the note.");
      setSaving(false);
    }
  };

  return (
    <div className="nl-qn" role="dialog" aria-modal="true" aria-labelledby="nl-qn-title" data-testid="barber-quick-notes">
      <div className="nl-qn-card">
        <div className="nl-qn-head">
          <h2 id="nl-qn-title">Quick Notes</h2>
          <p data-testid="barber-quick-notes-visit"><strong>{visit.clientName ?? "Client"}</strong>{visit.services.length > 0 && <> · {visit.services.join(", ")}</>}{visit.staffName && <> · {visit.staffName}</>}</p>
        </div>
        {visit.previous && (
          <button type="button" className="qn-repeat-big" onClick={() => setChoices(previousChoices(visit))} data-testid="barber-qn-repeat-last">
            Repeat Last Cut<small>fills in last visit's picks</small>
          </button>
        )}
        {formulas && (visit.template.id === "barber" || visit.template.id === "hair") && (
          <button type="button" className="lcf-btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setFullEditor(true)} data-testid="barber-qn-full-formula">
            Full haircut formula
          </button>
        )}
        {visit.template.fields.map((f) => (
          <div key={f.key} className="nl-qn-field">
            <span className="nl-qn-label">{f.label}</span>
            <div className="nl-qn-options">
              {f.options.map((o) => (
                <button key={o} type="button" className={isPicked(f, o) ? "on" : ""} aria-pressed={isPicked(f, o)} onClick={() => pick(f, o)} data-testid={`barber-qn-${f.key}-${o}`}>{o}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="nl-qn-field">
          <span className="nl-qn-label">Additional Note</span>
          <input className="nl-qn-extra" value={extra} maxLength={1000} onChange={(e) => setExtra(e.target.value)} placeholder="Optional" data-testid="barber-qn-extra" />
        </div>
        {error && <p className="nl-qn-error" role="alert">{error}</p>}
        <div className="nl-qn-actions">
          <button type="button" className="nl-qn-skip" onClick={onDone} data-testid="barber-qn-skip">Skip</button>
          <button type="button" className="nl-qn-save" disabled={!anything || saving} onClick={() => void save()} data-testid="barber-qn-save">{saving ? "Saving…" : "Save Notes"}</button>
        </div>
      </div>
      {fullEditor && (
        <FormulaEditor appointmentId={appointmentId} clientId={visit.clientId} clientName={visit.clientName}
          onSaved={() => setEditorSaved(true)} onClose={() => { setFullEditor(false); if (editorSaved) onDone(); }} />
      )}
    </div>
  );
}
