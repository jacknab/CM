import { useEffect, useState } from "react";

/**
 * Quick Notes (owner, 2026-11-11; server routes/quickNotes.ts): once a ticket with a client is checked out, a one-screen
 * note on how they like it: the business type's choices, all optional, and an optional line of the tech's own words.
 * The services come from the ticket and are only shown. Certxa writes the note in sentences and keeps it with the
 * client. A ticket with only a name (no client), or no connection, skips straight on.
 */
type Field = { key: string; label: string; options: string[]; multi?: boolean };
type Visit = { available: boolean; template: { id: string; fields: Field[] }; clientName: string | null; staffName: string | null; services: string[] };

export function QuickNotesPopup({ appointmentId, onDone }: { appointmentId: number; onDone: () => void }) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [choices, setChoices] = useState<Record<string, string | string[]>>({});
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/quick-notes/appointment/${appointmentId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: Visit | null) => { if (!live) return; if (v?.available) setVisit(v); else onDone(); })
      .catch(() => { if (live) onDone(); });
    return () => { live = false; };
  }, [appointmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visit) return null;

  const pick = (f: Field, option: string) => setChoices((c) => {
    if (f.multi) {
      const now = Array.isArray(c[f.key]) ? (c[f.key] as string[]) : [];
      return { ...c, [f.key]: now.includes(option) ? now.filter((o) => o !== option) : [...now, option] };
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
    <div className="nl-qn" role="dialog" aria-modal="true" aria-labelledby="nl-qn-title" data-testid="nail-quick-notes">
      <div className="nl-qn-card">
        <div className="nl-qn-head">
          <h2 id="nl-qn-title">Quick Notes</h2>
          <p data-testid="nail-quick-notes-visit"><strong>{visit.clientName ?? "Client"}</strong>{visit.services.length > 0 && <> · {visit.services.join(", ")}</>}{visit.staffName && <> · {visit.staffName}</>}</p>
        </div>
        {visit.template.fields.map((f) => (
          <div key={f.key} className="nl-qn-field">
            <span className="nl-qn-label">{f.label}</span>
            <div className="nl-qn-options">
              {f.options.map((o) => (
                <button key={o} type="button" className={isPicked(f, o) ? "on" : ""} aria-pressed={isPicked(f, o)} onClick={() => pick(f, o)} data-testid={`nail-qn-${f.key}-${o}`}>{o}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="nl-qn-field">
          <span className="nl-qn-label">Additional Note</span>
          <input className="nl-qn-extra" value={extra} maxLength={1000} onChange={(e) => setExtra(e.target.value)} placeholder="Optional" data-testid="nail-qn-extra" />
        </div>
        {error && <p className="nl-qn-error" role="alert">{error}</p>}
        <div className="nl-qn-actions">
          <button type="button" className="nl-qn-skip" onClick={onDone} data-testid="nail-qn-skip">Skip</button>
          <button type="button" className="nl-qn-save" disabled={!anything || saving} onClick={() => void save()} data-testid="nail-qn-save">{saving ? "Saving…" : "Save Notes"}</button>
        </div>
      </div>
    </div>
  );
}
