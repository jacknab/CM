import { useEffect, useState } from "react";
import { Ban, CalendarDays, Check, Clock, Hand, Phone, Play, Receipt, ShoppingBag, UserRound, X, MessageSquare } from "lucide-react";
import { useNailText } from "./i18n";
import { formatDuration, formatElapsed } from "./ticketDraft";
import type { BoardTicket } from "./nailApi";

interface Props {
  ticket: BoardTicket;
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  /** DONE: the technician has finished; they are freed and the ticket waits to be paid. */
  onDone?: (t: BoardTicket) => void;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  /** Text the client that their technician is ready. Offered for an assigned ticket that has not started. */
  onTextReady?: (t: BoardTicket) => void;
  onClose: () => void;
  /** Server clock minus this device's clock, so times read the same on every POS station. */
  clockOffsetMs?: number;
}

const NO_COLOR = "#454c56";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * A ticket's card — details plus the action dock. An unassigned waiting ticket must be
 * assigned before it can be started; this keeps it visible in Checked In until a tech is chosen.
 * It opens over whatever screen the ticket was tapped on and closes back to that same screen.
 */
export function TicketPopup(p: Props) {
  const t = p.ticket;
  const { t: tr } = useNailText();
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + (p.clockOffsetMs ?? 0);
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const dock: { icon: typeof Play; id: string; label: string; action: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }[] = t.status === "confirmed"
    ? [
        t.staff
          ? { icon: Play, id: "START", label: tr("start"), action: () => p.onStart(t), primary: true }
          : { icon: UserRound, id: "ASSIGN", label: tr("assign"), action: () => p.onReassign(t), primary: true },
        ...(t.staff ? [{ icon: ShoppingBag, id: "CHECKOUT", label: tr("checkout"), action: () => p.onCheckout(t) }] : []),
        { icon: UserRound, id: "REASSIGN", label: tr("reassign"), action: () => p.onReassign(t), disabled: !t.staff },
        { icon: Receipt, id: "TICKET", label: tr("ticket"), action: () => p.onEdit(t) },
        ...(t.staff && t.client.phone && p.onTextReady ? [{ icon: MessageSquare, id: "TEXT READY", label: tr("textReady"), action: () => p.onTextReady!(t) }] : []),
        { icon: Ban, id: "CANCEL", label: tr("cancel"), action: () => p.onCancel(t), danger: true },
      ]
    : [
        ...(!t.doneAt && p.onDone ? [{ icon: Check, id: "DONE", label: tr("done"), action: () => p.onDone!(t), primary: true }] : []),
        { icon: ShoppingBag, id: "CHECKOUT", label: tr("checkout"), action: () => p.onCheckout(t), primary: !!t.doneAt || !p.onDone },
        { icon: UserRound, id: "REASSIGN", label: tr("reassign"), action: () => p.onReassign(t) },
        { icon: Receipt, id: "TICKET", label: tr("ticket"), action: () => p.onEdit(t) },
        { icon: Ban, id: "CANCEL", label: tr("cancel"), action: () => p.onCancel(t), danger: true },
      ];

  return (
    <>
      <div className="checkin-overlay" onClick={() => p.onClose()} />
      <div className="checkin-modal-wrapper" onClick={() => p.onClose()}>
        <div className="checkin-modal-card" role="dialog" aria-modal="true" aria-labelledby="nail-ticket-title" onClick={(e) => e.stopPropagation()} data-testid="nail-ticket-modal">
          <button type="button" className="checkin-modal-close" onClick={() => p.onClose()} aria-label="Close"><X size={16} /></button>
          <div className="checkin-card-header checkin-card-header-lg" style={{ borderLeftColor: t.staff?.color || NO_COLOR }}>
            <div className="checkin-client">
              <div className="checkin-card-name-row">
                <strong id="nail-ticket-title">{t.client.name}</strong>
                {/* A ticket made offline has its number already (it is the one printed); a POS station that could not
                    reach the main POS gets one when the ticket is sent. */}
                <span className="checkin-ticket-num">{t.ticketNumber != null ? `#${t.ticketNumber}` : t.offline ? "NUMBER PENDING" : `#${t.id}`}</span>
              </div>
              <span><Phone size={13} /> {t.client.phone ?? "No phone"}</span>
            </div>
            <div className="checkin-status-pill" style={{ marginRight: 40 }} data-in-service={t.status === "started"}>
              {t.status === "started" ? "IN SERVICE · UNPAID" : t.staff ? `WAITING · WITH ${t.staff.name.toUpperCase()}` : "WAITING · UNASSIGNED"}
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
                {t.customLines.map((l, i) => <div key={`c${i}`}><span>{l.serviceId || l.packageId ? l.label : `+ ${l.label}`}</span><span>{l.price < 0 ? "-" : ""}${Math.abs(l.price).toFixed(2)}</span></div>)}
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
            <button key={b.id} type="button" disabled={p.busy || b.disabled} onClick={() => { b.action(); p.onClose(); }} data-testid={`nail-dock-${b.id.toLowerCase()}`}
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
