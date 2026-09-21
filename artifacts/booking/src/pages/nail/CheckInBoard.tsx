import { useEffect, useState } from "react";
import { Ban, CalendarDays, Clock, Hand, Phone, Play, Receipt, ShoppingBag, UserRound, X } from "lucide-react";
import { formatDuration, formatElapsed } from "./ticketDraft";
import type { BoardTicket } from "./nailApi";

interface Props {
  tickets: BoardTicket[];
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  /** Open this ticket's card straight away (Techs page tap, scanned ticket). A new object = open it again. */
  focus?: { id: number } | null;
  /** Server clock minus this device's clock, so times read the same on every POS station. */
  clockOffsetMs?: number;
}

const NO_COLOR = "#454c56";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * The tickets that are IN SERVICE and not paid yet — the front desk's list of who to check out. (Clients who are still
 * waiting live on the Techs page's Checked In list; this tab is only for tickets already in the chair.)
 */
export function CheckInBoard(p: Props) {
  const [openId, setOpenId] = useState<number | null>(p.focus?.id ?? null);
  useEffect(() => { if (p.focus) setOpenId(p.focus.id); }, [p.focus]);
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + (p.clockOffsetMs ?? 0);
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const inService = p.tickets
    .filter((t) => t.status === "started")
    .sort((a, b) => +new Date(a.startedAt ?? a.date) - +new Date(b.startedAt ?? b.date));
  const unpaidTotal = inService.reduce((s, t) => s + t.total, 0);
  // A card can also be opened for a ticket that hasn't started yet (tapped on the Techs page's waiting list) — it gets START.
  const open = p.tickets.find((t) => t.id === openId) ?? null;

  const card = (t: BoardTicket) => {
    const since = t.startedAt ?? t.date;
    return (
      <div key={t.id} className={`checkin-card ${openId === t.id ? "checkin-card-active" : ""}`} onClick={() => setOpenId(t.id)} data-testid={`nail-card-${t.id}`}>
        <div className="checkin-card-header" style={{ borderLeftColor: t.staff?.color || NO_COLOR }}>
          <div className="checkin-client">
            <div className="checkin-card-name-row">
              <strong>{t.client.name}</strong>
              <span className="checkin-ticket-num">#{t.ticketNumber ?? t.id}</span>
            </div>
            <span className="checkin-card-meta">
              <Hand size={11} /> {t.service.name}{t.addons.length > 0 ? ` +${t.addons.length}` : ""}
              {t.staff ? (<><UserRound size={11} /> {t.staff.name}</>) : <span className="checkin-unassigned">Unassigned</span>}
            </span>
            <span><Clock size={11} /> In chair {formatElapsed(since, now)}</span>
          </div>
          <div className="checkin-card-right">
            <span className="checkin-card-total">${t.total.toFixed(2)}</span>
            <div className="checkin-status-pill" data-in-service="false">UNPAID</div>
          </div>
        </div>
      </div>
    );
  };

  const dock: { icon: typeof Play; label: string; action: () => void; primary?: boolean; danger?: boolean }[] = open
    ? open.status === "confirmed"
      ? [
          { icon: Play, label: "START", action: () => p.onStart(open), primary: true },
          { icon: UserRound, label: "REASSIGN", action: () => p.onReassign(open) },
          { icon: Receipt, label: "TICKET", action: () => p.onEdit(open) },
          { icon: Ban, label: "CANCEL", action: () => p.onCancel(open), danger: true },
        ]
      : [
          { icon: ShoppingBag, label: "CHECKOUT", action: () => p.onCheckout(open), primary: true },
          { icon: UserRound, label: "REASSIGN", action: () => p.onReassign(open) },
          { icon: Receipt, label: "TICKET", action: () => p.onEdit(open) },
        ]
    : [];

  return (
    <section className="checkin-board" data-testid="nail-board">
      <div className="checkin-board-header">
        <h1>In Service · Unpaid</h1>
        <p>{inService.length === 0 ? "Nobody is in the chair right now." : `${inService.length} ticket${inService.length === 1 ? "" : "s"} · $${unpaidTotal.toFixed(2)} to collect — tap one to check out`}</p>
      </div>
      <div className="checkin-columns checkin-columns-full">
        <div className="checkin-column checkin-column-service" data-testid="nail-col-service">
          <div className="checkin-column-header">
            <h2>In Service</h2>
            <span className="checkin-count">{inService.length}</span>
          </div>
          <div className="checkin-card-list">
            {inService.length === 0 ? (
              <div className="checkin-empty">
                <Hand size={32} />
                <p>No tickets in service</p>
              </div>
            ) : inService.map(card)}
          </div>
        </div>
      </div>

      {open && (
        <>
          <div className="checkin-overlay" onClick={() => setOpenId(null)} />
          <div className="checkin-modal-wrapper" onClick={() => setOpenId(null)}>
            <div className="checkin-modal-card" onClick={(e) => e.stopPropagation()} data-testid="nail-ticket-modal">
              <button type="button" className="checkin-modal-close" onClick={() => setOpenId(null)} aria-label="Close"><X size={16} /></button>
              <div className="checkin-card-header checkin-card-header-lg" style={{ borderLeftColor: open.staff?.color || NO_COLOR }}>
                <div className="checkin-client">
                  <div className="checkin-card-name-row">
                    <strong>{open.client.name}</strong>
                    <span className="checkin-ticket-num">#{open.ticketNumber ?? open.id}</span>
                  </div>
                  <span><Phone size={13} /> {open.client.phone ?? "No phone"}</span>
                </div>
                <div className="checkin-status-pill" style={{ marginRight: 40 }} data-in-service={open.status === "started"}>
                  {open.status === "started" ? "IN SERVICE · UNPAID" : "WAITING"}
                </div>
              </div>
              <div className="checkin-modal-body">
                <div className="checkin-modal-detail">
                  <Hand size={18} />
                  <div><small>Service</small><strong>{open.service.name}</strong></div>
                </div>
                {(open.addons.length > 0 || (open.nail?.lines.length ?? 0) > 0 || open.customLines.length > 0) && (
                  <div className="checkin-modal-lines">
                    {open.addons.map((a) => <div key={`a${a.id}`}><span>+ {a.name}</span><span>${a.price.toFixed(2)}</span></div>)}
                    {open.nail?.lines.map((l) => <div key={l.label}><span>+ {l.label}</span><span>${l.price.toFixed(2)}</span></div>)}
                    {open.customLines.map((l, i) => <div key={`c${i}`}><span>+ {l.label}</span><span>${l.price.toFixed(2)}</span></div>)}
                  </div>
                )}
                <div className="checkin-modal-detail">
                  <UserRound size={18} />
                  <div><small>Technician</small><strong>{open.staff?.name ?? "Not assigned"}</strong></div>
                </div>
                <div className="checkin-modal-detail">
                  <Clock size={18} />
                  <div><small>{open.status === "started" ? "In chair since" : "Duration"}</small><strong>{open.status === "started" ? `${fmtTime(open.startedAt ?? open.date)} · ${formatElapsed(open.startedAt ?? open.date, now)}` : formatDuration(open.duration)}</strong></div>
                </div>
                <div className="checkin-modal-detail">
                  <CalendarDays size={18} />
                  <div><small>Total to collect</small><strong>${open.total.toFixed(2)}</strong></div>
                </div>
              </div>
            </div>

            <div className="checkin-dock" onClick={(e) => e.stopPropagation()}>
              {dock.map((b) => (
                <button key={b.label} type="button" disabled={p.busy} onClick={() => { b.action(); setOpenId(null); }} data-testid={`nail-dock-${b.label.toLowerCase()}`}
                  className={`checkin-dock-btn ${b.primary ? "checkin-dock-primary" : ""} ${b.danger ? "checkin-dock-danger" : ""}`}>
                  <b.icon size={22} />
                  <span>{b.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
