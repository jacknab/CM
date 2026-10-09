import { Phone, UserRound, X } from "lucide-react";
import type { BoardMarker } from "./barberApi";

/**
 * A waiting client's card. There is no ticket yet — the barber only takes the client here;
 * the ticket is made when they ring the client up.
 */
export function MarkerPopup({ marker, busy, onAssign, onClose }: {
  marker: BoardMarker;
  busy: boolean;
  onAssign: (m: BoardMarker) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="checkin-overlay" onClick={onClose} />
      <div className="checkin-modal-wrapper" onClick={onClose}>
        <div className="checkin-modal-card" role="dialog" aria-modal="true" aria-labelledby="barber-marker-title" onClick={(e) => e.stopPropagation()} data-testid="barber-marker-modal">
          <button type="button" className="checkin-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
          <div className="checkin-card-header checkin-card-header-lg">
            <div className="checkin-client">
              <div className="checkin-card-name-row">
                <strong id="barber-marker-title">{marker.clientName ?? "Guest"}</strong>
              </div>
              <span><Phone size={13} /> {marker.phone ?? "No phone"}</span>
            </div>
          </div>
        </div>

        <div className="checkin-dock" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="checkin-dock-btn checkin-dock-primary" disabled={busy} onClick={() => onAssign(marker)} data-testid="barber-marker-assign">
            <UserRound size={22} />
            <span>ASSIGN</span>
          </button>
          <button type="button" className="checkin-dock-btn" disabled={busy} onClick={onClose} data-testid="barber-marker-cancel">
            <X size={22} />
            <span>CANCEL</span>
          </button>
        </div>
      </div>
    </>
  );
}
