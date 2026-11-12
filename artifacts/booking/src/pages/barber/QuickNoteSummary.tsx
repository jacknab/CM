import { quickNoteLists } from "@shared/quickNotes";
import { salonTimeZone } from "@/lib/salonClock";
import { sinceVisit } from "./sinceVisit";

/**
 * A client's last-visit haircut formula, scannable in a few seconds (owner, 2026-11-12): when, who and what service
 * on one line, then grouped pill badges — Sides (guard + fade), Top, Neckline | Sideburns — empty rows left out, and
 * the barber's own words underneath. Older notes (one pick per field, or another template) still show.
 */
export type SavedQuickNote = {
  id: number; text: string; template?: string; choices?: unknown; extra?: string; services?: string[];
  createdAt: string; visitAt?: string; staffName: string | null; serviceName?: string | null;
};

export function QuickNoteSummary({ note, testId }: { note: SavedQuickNote; testId?: string }) {
  const at = new Date(note.visitAt || note.createdAt);
  const service = note.serviceName || note.services?.[0] || null;
  const haircut = note.template === "barber" || note.template === "hair";
  const l = quickNoteLists(note.choices);
  // One labelled row per section, as the owner's "Last Cut Formula" design (2026-11-12); empty sections left out.
  const rows = haircut ? [
    { label: "Sides Guard", tags: l.guard }, { label: "Fade", tags: l.fade }, { label: "Neckline", tags: l.neckline },
    { label: "Sideburns", tags: l.sideburns }, { label: "Top Length", tags: l.top },
  ].filter((r) => r.tags.length) : [];
  const extra = note.extra?.trim();
  return (
    <div className="qn-sum" data-testid={testId}>
      <p className="qn-sum-title">Last Cut Formula</p>
      <p className="qn-sum-meta">
        {at.toLocaleString("en-US", { timeZone: salonTimeZone(), weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
        <span>{` · ${sinceVisit(at)}`}{note.staffName ? ` • ${note.staffName}` : ""}{service ? ` • ${service}` : ""}</span>
      </p>
      {rows.length > 0 ? (
        <>
          {rows.map((r) => (
            <div key={r.label} className="qn-sum-section">
              <p className="qn-sum-label">{r.label}</p>
              <div className="qn-sum-pills">{r.tags.map((t) => <span key={t} className="qn-pill">{t}</span>)}</div>
            </div>
          ))}
          {extra ? <div className="qn-sum-section"><p className="qn-sum-label">Notes</p><p className="qn-sum-extra">{extra}</p></div> : null}
        </>
      ) : (
        <p className="qn-sum-text">{note.text}</p>
      )}
    </div>
  );
}

/** The big dark "Repeat Last Cut" button under the formula. */
export function RepeatCutButton({ on, onClick, testId }: { on: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" className="qn-repeat-big" disabled={on} onClick={onClick} data-testid={testId}>
      {on ? "Repeat Last Cut · set" : "Repeat Last Cut"}
      <small>{on ? "fills in when this visit is checked out" : "or Copy to Current Cut"}</small>
    </button>
  );
}
