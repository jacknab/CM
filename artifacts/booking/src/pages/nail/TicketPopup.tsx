import { useEffect, useState } from "react";
import { Ban, CalendarDays, Clock, Hand, Phone, Play, Receipt, ShoppingBag, UserRound, X } from "lucide-react";
import { formatDuration, formatElapsed } from "./ticketDraft";
import type { BoardTicket } from "./nailApi";

interface Props {
  ticket: BoardTicket;
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  onClose: () => void;
  /** Server clock minus this device's clock, so times read the same on every POS station. */
  clockOffsetMs?: number;
}

const NO_COLOR = "#454c56";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * A ticket's card — details plus the action dock (Checkout / Reassign / Ticket, or Start / Reassign / Ticket / Cancel for one still waiting).
 * It opens over whatever screen the ticket was tapped on and closes back to that same screen.
 */
export function TicketPopup(p: Props) {
  const t = p.ticket;
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + (p.clockOffsetMs ?? 0);
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const dock: { icon: typeof Play; label: string; action: () => void; primary?: boolean; danger?: boolean }[] = t.status === "confirmed"
    ? [
        { icon: Play, label: "START", action: () => p.onStart(t), primary: true },
        { icon: UserRound, label: "REASSIGN", action: () => p.onReassign(t) },
        { icon: Receipt, label: "TICKET", action: () => p.onEdit(t) },
        { icon: Ban, label: "CANCEL", action: () => p.onCancel(t), danger: true },
      ]
    : [
        { icon: ShoppingBag, label: "CHECKOUT", action: () => p.onCheckout(t), primary: true },
        { icon: UserRound, label: "REASSIGN", action: () => p.onReassign(t) },
        { icon: Receipt, label: "TICKET", action: () => p.onEdit(t) },
      ];

  return (
    <>
      <div className="checkin-overlay" onClick={() => p.onClose()} />
      <div className="checkin-modal-wrapper" onClick={() => p.onClose()}>
        <div className="checkin-modal-card" onClick={(e) => e.stopPropagation()} data-testid="nail-ticket-modal">
          <button type="button" className="checkin-modal-close" onClick={() => p.onClose()} aria-label="Close"><X size={16} /></button>
          <div className="checkin-card-header checkin-card-header-lg" style={{ borderLeftColor: t.staff?.color || NO_COLOR }}>
            <div className="checkin-client">
              <div className="checkin-card-name-row">
                <strong>{t.client.name}</strong>
                <span className="checkin-ticket-num">#{t.ticketNumber ?? t.id}</span>
              </div>
              <span><Phone size={13} /> {t.client.phone ?? "No phone"}</span>
            </div>
            <div className="checkin-status-pill" style={{ marginRight: 40 }} data-in-service={t.status === "started"}>
              {t.status === "started" ? "IN SERVICE · UNPAID" : "WAITING"}
            </div>
          </div>
          <div className="checkin-modal-body">
            <div className="checkin-modal-detail">
              <Hand size={18} />
              <div><small>Service</small><strong>{t.service.name}</strong></div>
            </div>
            {(t.addons.length > 0 || (t.nail?.lines.length ?? 0) > 0 || t.customLines.length > 0) && (
              <div className="checkin-modal-lines">
                {t.addons.map((a) => <div key={`a${a.id}`}><span>+ {a.name}</span><span>${a.price.toFixed(2)}</span></div>)}
                {t.nail?.lines.map((l) => <div key={l.label}><span>+ {l.label}</span><span>${l.price.toFixed(2)}</span></div>)}
                {t.customLines.map((l, i) => <div key={`c${i}`}><span>+ {l.label}</span><span>${l.price.toFixed(2)}</span></div>)}
              </div>
            )}
            <div className="checkin-modal-detail">
              <UserRound size={18} />
              <div><small>Technician</small><strong>{t.staff?.name ?? "Not assigned"}</strong></div>
            </div>
            <div className="checkin-modal-detail">
              <Clock size={18} />
              <div><small>{t.status === "started" ? "In chair since" : "Duration"}</small><strong>{t.status === "started" ? `${fmtTime(t.startedAt ?? t.date)} · ${formatElapsed(t.startedAt ?? t.date, now)}` : formatDuration(t.duration)}</strong></div>
            </div>
            <div className="checkin-modal-detail">
              <CalendarDays size={18} />
              <div><small>Total to collect</small><strong>${t.total.toFixed(2)}</strong></div>
            </div>
          </div>
        </div>

        <div className="checkin-dock" onClick={(e) => e.stopPropagation()}>
          {dock.map((b) => (
            <button key={b.label} type="button" disabled={p.busy} onClick={() => { b.action(); p.onClose(); }} data-testid={`nail-dock-${b.label.toLowerCase()}`}
              className={`checkin-dock-btn ${b.primary ? "checkin-dock-primary" : ""} ${b.danger ? "checkin-dock-danger" : ""}`}>
              <b.icon size={22} />
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
