import { useEffect, useState } from "react";
import { Ban, CalendarDays, Check, Clock, Hand, Phone, Play, Receipt, ShoppingBag, Split, UserRound, X, MessageSquare } from "lucide-react";
import { useNailText } from "./i18n";
import { formatDuration, formatElapsed } from "./ticketDraft";
import { ticketNo, type BoardTicket } from "./nailApi";
import { techLabel } from "./techName";

interface Props {
  ticket: BoardTicket;
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  /** DONE: the technician has finished; they are freed and the ticket waits to be paid. */
  onDone?: (t: BoardTicket) => void;
  /** The client is in service on this other ticket: this one can't be assigned or started until that is done. */
  inChairOn?: number | null;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  /** Text the client that their technician is ready. Offered for an assigned ticket that has not started. */
  onTextReady?: (t: BoardTicket) => void;
  onClose: () => void;
  /** Server clock minus this device's clock, so times read the same on every POS station. */
  clockOffsetMs?: number;
  /** The visit's other tickets (same number, services other technicians do): the whole visit is shown. */
  visit?: BoardTicket[];
  /** Opens another part of the same visit in this popup (the SPLIT TICKET button above the dock). */
  onOpenTicket?: (t: BoardTicket) => void;
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
  const visitParts = p.onOpenTicket ? (p.visit ?? []) : [];
  const isSplit = (p.visit?.length ?? 0) > 0;
  const visitTotal = Math.round((t.total + (p.visit ?? []).reduce((n, v) => n + v.total, 0)) * 100) / 100;
  const now = tick + (p.clockOffsetMs ?? 0);
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const dock: { icon: typeof Play; id: string; label: string; action: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }[] = t.status === "confirmed"
    ? [
        t.staff
          ? { icon: Play, id: "START", label: tr("start"), action: () => p.onStart(t), primary: true, disabled: p.inChairOn != null }
          : { icon: UserRound, id: "ASSIGN", label: tr("assign"), action: () => p.onReassign(t), primary: true, disabled: p.inChairOn != null },
        ...(t.staff ? [{ icon: ShoppingBag, id: "CHECKOUT", label: tr("checkout"), action: () => p.onCheckout(t) }] : []),
        { icon: UserRound, id: "REASSIGN", label: tr("reassign"), action: () => p.onReassign(t), disabled: !t.staff || p.inChairOn != null },
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
      <div className="checkin-modal-wrapper ticket-popup" onClick={() => p.onClose()}>
        <div className="checkin-modal-card" role="dialog" aria-modal="true" aria-labelledby="nail-ticket-title" onClick={(e) => e.stopPropagation()} data-testid="nail-ticket-modal">
          <button type="button" className="checkin-modal-close" onClick={() => p.onClose()} aria-label="Close"><X size={16} /></button>
          <div className="checkin-card-header checkin-card-header-lg" style={{ borderLeftColor: t.staff?.color || NO_COLOR }}>
            <div className="checkin-client">
              <div className="checkin-card-name-row">
                <strong id="nail-ticket-title">{t.client.name}</strong>
                {/* A ticket made offline has its number already (it is the one printed); a POS station that could not
                    reach the main POS gets one when the ticket is sent. */}
                <span className="checkin-ticket-num">{t.ticketNumber != null ? `#${ticketNo(t)}` : t.offline ? "NUMBER PENDING" : `#${t.id}`}</span>
              </div>
              <span><Phone size={13} /> {t.client.phone ?? "No phone"}</span>
            </div>
            <div className="checkin-status-pill" style={{ marginRight: 40 }} data-in-service={t.status === "started"}>
              {t.doneAt ? "DONE · UNPAID" : t.status === "started" ? "IN SERVICE · UNPAID" : t.staff ? `WAITING · WITH ${techLabel(t.staff.name, t.staff.id).toUpperCase()}` : "WAITING · UNASSIGNED"}
            </div>
          </div>
          <div className="checkin-modal-body">
            <div className="checkin-modal-detail">
              <Hand size={18} />
              <div style={{ flex: 1 }}><small>Service</small><strong>{t.service.name}</strong></div>
              {/* The service's own price, like its add-ons below, so the lines add up to the total (owner, 2026-10-29). */}
              {t.service.price > 0 && <span className="checkin-modal-price" data-testid="nail-popup-service-price">${t.service.price.toFixed(2)}</span>}
            </div>
            {(t.addons.length > 0 || (t.nail?.lines.length ?? 0) > 0 || t.customLines.length > 0) && (
              <div className="checkin-modal-lines">
                {/* The same add-on more than once is one line with its count and the amount for all of them. */}
                {groupedAddons(t.addons).map((a) => <div key={`a${a.id}`}><span>+ {a.name}{a.count > 1 ? ` ×${a.count}` : ""}</span><span>${(a.price * a.count).toFixed(2)}</span></div>)}
                {t.nail?.lines.map((l) => <div key={l.label}><span>+ {l.label}</span><span>${l.price.toFixed(2)}</span></div>)}
                {t.customLines.map((l, i) => <div key={`c${i}`}><span>{l.serviceId || l.packageId ? l.label : `+ ${l.label}`}</span><span>{l.price < 0 ? "-" : ""}${Math.abs(l.price).toFixed(2)}</span></div>)}
              </div>
            )}
            {/* A split ticket shows only its own part (owner, 2026-10-29): this part's service + add-ons, then the
                tickets' total at the bottom. The other part is one tap away (SPLIT TICKET button). */}
            {isSplit && (
              <div className="checkin-modal-lines checkin-modal-subtotal" data-testid="nail-popup-service-total">
                <div><span>Service total</span><span>${t.total.toFixed(2)}</span></div>
              </div>
            )}
            <div className="checkin-modal-detail">
              <UserRound size={18} />
              <div><small>Technician</small><strong>{t.staff ? techLabel(t.staff.name, t.staff.id) : "Not assigned"}</strong></div>
            </div>
            {t.actualMinutes != null && (
              // DONE: how long the service really took, against the time planned for it.
              <div className="checkin-modal-detail" data-testid="nail-popup-service-time">
                <Clock size={18} />
                <div><small>Service time</small><strong>{`${formatDuration(t.actualMinutes)} · planned ${formatDuration(t.duration)}`}</strong></div>
              </div>
            )}
            <div className="checkin-modal-detail">
              <Clock size={18} />
              {/* After DONE the clock stops: when it was done, not a time still counting up. */}
              <div><small>{t.doneAt ? "Done at" : t.status === "started" ? "In chair since" : "Duration"}</small><strong>{t.doneAt ? fmtTime(t.doneAt) : t.status === "started" ? `${fmtTime(t.startedAt ?? t.date)} · ${formatElapsed(t.startedAt ?? t.date, now)}` : formatDuration(t.duration)}</strong></div>
            </div>
            <div className="checkin-modal-detail">
              <CalendarDays size={18} />
              {/* A visit split between technicians is paid once, for all of it (CheckoutMode): show that amount. */}
              <div><small>{isSplit ? `Tickets total · ${1 + (p.visit?.length ?? 0)} tickets` : "Total to collect"}</small><strong data-testid="nail-popup-total">${visitTotal.toFixed(2)}</strong></div>
            </div>
          </div>
        </div>

        {t.status === "confirmed" && p.inChairOn != null && (
          <p className="assign-create-hint" style={{ margin: "0 22px 10px" }} data-testid="nail-popup-in-chair">
            {`${t.client.name} is in service on #${p.inChairOn}. This ticket can be assigned and started once that service is done.`}
          </p>
        )}
        <div className={`checkin-dock ${visitParts.length ? "checkin-dock-has-visit" : ""}`} onClick={(e) => e.stopPropagation()}>
          {/* Part of a visit split between technicians (owner, 2026-10-29): a full-width button per other part opens it,
              and shows at a glance that this ticket is one part of a split ticket. */}
          {visitParts.map((v) => (
            <button key={`visit-${v.id}`} type="button" onClick={() => p.onOpenTicket!(v)} data-testid="nail-dock-visit-part"
              className="checkin-dock-btn checkin-dock-visit">
              <Split size={22} />
              <span>{v.staff ? `SPLIT TICKET · ${techLabel(v.staff.name, v.staff.id).toUpperCase()}'S PART` : "SPLIT TICKET · OTHER PART"}</span>
            </button>
          ))}
          {dock.map((b, i) => (
            <button key={b.id} type="button" disabled={p.busy || b.disabled} onClick={() => { b.action(); p.onClose(); }} data-testid={`nail-dock-${b.id.toLowerCase()}`}
              className={`checkin-dock-btn ${b.primary ? "checkin-dock-primary" : ""} ${b.danger ? "checkin-dock-danger" : ""} ${dock.length % 2 === 1 && i === dock.length - 1 ? "checkin-dock-wide" : ""}`}>
              <b.icon size={22} />
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Add-ons grouped by id, in the order first added, each with how many times it is on the ticket. */
function groupedAddons(addons: BoardTicket["addons"]): (BoardTicket["addons"][number] & { count: number })[] {
  const byId = new Map<number, BoardTicket["addons"][number] & { count: number }>();
  for (const a of addons) {
    const seen = byId.get(a.id);
    if (seen) seen.count += 1; else byId.set(a.id, { ...a, count: 1 });
  }
  return [...byId.values()];
}
