import { useEffect, useState } from "react";
import { UserRound, X, XCircle } from "lucide-react";
import type { BoardMarker } from "./barberApi";
import { salonTimeZone } from "@/lib/salonClock";
import { QuickNoteSummary, RepeatCutButton, type SavedQuickNote } from "./QuickNoteSummary";
import { isRepeatFormulaMarked, markRepeatFormula } from "./repeatFormula";

/**
 * A waiting client's card. There is no ticket yet — the barber only takes the client here; the ticket is made when
 * they ring the client up. Sized for a 10" tablet (owner, 2026-11-02): big name and ticket number, no phone number,
 * large buttons — Assign to me, Cancel check-in (takes them off the waiting list), Close.
 * A client with Quick Notes shows their last visit's note right here, with the visit's full date and time and how long
 * ago it was (owner, 2026-11-12: "seen easily by tapping on the check-in card"; GET /api/quick-notes/client/:id).
 */
export { sinceVisit } from "./sinceVisit";

export function MarkerPopup({ marker, busy, onAssign, onCancelCheckin, onClose }: {
  marker: BoardMarker;
  busy: boolean;
  onAssign: (m: BoardMarker) => void;
  /** Takes the client off the waiting list (asks first). */
  onCancelCheckin: (m: BoardMarker) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<SavedQuickNote[]>([]);
  const [repeat, setRepeat] = useState(() => isRepeatFormulaMarked(marker.clientId));
  useEffect(() => {
    const clientId = Number(marker.clientId);
    if (!(clientId > 0)) { setNotes([]); return; }
    let live = true;
    fetch(`/api/quick-notes/client/${clientId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setNotes(Array.isArray(d?.notes) ? d.notes.slice(0, 1) : []); }) // the last visit only
      .catch(() => {});
    return () => { live = false; };
  }, [marker.clientId]);
  const since = (() => { const d = new Date(marker.createdAt); return Number.isNaN(d.getTime()) ? null : d; })();
  return (
    <div className="mp-backdrop" onClick={onClose}>
      <div className="mp-card" role="dialog" aria-modal="true" aria-labelledby="barber-marker-title" onClick={(e) => e.stopPropagation()} data-testid="barber-marker-modal">
        <button type="button" className="mp-close-x" onClick={onClose} aria-label="Close"><X size={30} /></button>
        <p className="mp-eyebrow">Waiting · no ticket yet</p>
        <div className="mp-who">
          {marker.ticketNumber != null && <span className="mp-ticket">#{marker.ticketNumber}</span>}
          <strong id="barber-marker-title">{(marker.clientName ?? "Guest").trim() || "Guest"}</strong>
        </div>
        {since && <p className="mp-since">Checked in {since.toLocaleTimeString([], { timeZone: salonTimeZone(), hour: "numeric", minute: "2-digit" })}</p>}
        {notes.length > 0 && (
          <div className="mp-notes" data-testid="barber-marker-notes">
            {notes.map((n) => <QuickNoteSummary key={n.id} note={n} testId="barber-marker-last-visit" />)}
            {/* Repeat Last Cut: their last cut's picks fill in Quick Notes when this visit is checked out. */}
            <RepeatCutButton on={repeat} onClick={() => { markRepeatFormula(marker.clientId); setRepeat(true); }} testId="barber-marker-repeat-formula" />
          </div>
        )}
        <div className="mp-actions">
          <button type="button" className="mp-btn mp-btn-primary" disabled={busy} onClick={() => onAssign(marker)} data-testid="barber-marker-assign">
            <UserRound size={34} /><span>ASSIGN TO ME</span>
          </button>
          <button type="button" className="mp-btn mp-btn-danger" disabled={busy} onClick={() => onCancelCheckin(marker)} data-testid="barber-marker-cancel">
            <XCircle size={34} /><span>CANCEL CHECK-IN</span>
          </button>
          <button type="button" className="mp-btn" disabled={busy} onClick={onClose} data-testid="barber-marker-close">
            <span>CLOSE</span>
          </button>
        </div>
      </div>
    </div>
  );
}
