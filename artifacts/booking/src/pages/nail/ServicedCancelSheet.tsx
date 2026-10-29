import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { ManagerPinSheet } from "@/components/staff-screen/ManagerPinSheet";
import { syncEngine } from "@/lib/sync-engine";
import type { BoardTicket } from "./nailApi";
import { techLabel } from "./techName";

/**
 * Cancelling a ticket a technician already worked on (owner, 2026-10-29): allowed, but only with the reason written
 * down and the manager PIN. The server checks both and keeps the record for the owner (Reports › Cancelled after
 * service). Needs a connection: the PIN and the record are checked and saved on the server.
 */
export const MIN_REASON = 5;

export function ServicedCancelSheet({ ticket, onClose, onConfirm }: {
  ticket: BoardTicket;
  onClose: () => void;
  /** Called with the reason and the manager PIN; resolves when the server has cancelled it. */
  onConfirm: (reason: string, pin: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [askPin, setAskPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = syncEngine.isOffline();
  const stage = ticket.doneAt ? "marked DONE" : "started";
  const ready = reason.trim().length >= MIN_REASON && !busy && !offline;

  const submit = async (pin: string) => {
    setAskPin(false);
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), pin);
    } catch (err) {
      setError((err as Error)?.message || "Could not cancel the ticket");
      setBusy(false);
    }
  };

  // The PIN pad sits below this sheet's layer, so the sheet steps aside while the PIN is asked (the reason is kept).
  if (askPin) return <ManagerPinSheet title="Cancel serviced ticket · Manager PIN" onClose={() => setAskPin(false)} onSuccess={(pin) => void submit(pin)} />;

  return (
    <>
      <div className="assign-create-overlay" onClick={busy ? undefined : onClose} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-labelledby="nail-serviced-cancel-title" data-testid="nail-serviced-cancel">
        <div className="assign-create-header">
          <div>
            <h2 id="nail-serviced-cancel-title">Cancel a serviced ticket</h2>
            <p>{ticket.ticketNumber != null ? `#${ticket.ticketNumber} · ` : ""}{ticket.client.name}</p>
          </div>
          <button type="button" className="assign-create-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="assign-create-notice">
          <AlertTriangle size={14} />
          <span>
            {`${ticket.staff ? techLabel(ticket.staff.name, ticket.staff.id) : "A technician"} already ${stage} this service. Cancelling it needs the reason and the manager PIN. The owner sees both.`}
          </span>
        </div>
        <div style={{ padding: "10px 22px" }}>
          <input className="gift-input" style={{ width: "100%", height: 46, fontSize: 15, fontWeight: 500, letterSpacing: 0, textTransform: "none" }}
            value={reason} maxLength={300} autoFocus onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this ticket being cancelled?" aria-label="Reason for cancelling" data-testid="nail-serviced-cancel-reason" />
        </div>
        {offline && <p className="assign-create-error">No connection. A serviced ticket can only be cancelled online.</p>}
        {error && <p className="assign-create-error" data-testid="nail-serviced-cancel-error">{error}</p>}
        <div className="assign-create-footer">
          <button type="button" className="assign-create-skip" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" disabled={!ready} onClick={() => setAskPin(true)} data-testid="nail-serviced-cancel-continue"
            className={`assign-create-btn ${ready ? "assign-create-btn-ready" : ""}`}>
            {busy ? "CANCELLING…" : "MANAGER PIN · CANCEL TICKET"}
          </button>
        </div>
      </div>
    </>
  );
}
