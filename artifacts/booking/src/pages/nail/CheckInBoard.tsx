import { useEffect, useState } from "react";
import { Ban, CalendarDays, Clock, Hand, Phone, Play, Receipt, ShoppingBag, UserRound, X } from "lucide-react";
import { formatDuration, formatElapsed } from "./ticketDraft";
import type { BoardMarker, BoardTicket } from "./nailApi";

interface Props {
  tickets: BoardTicket[];
  markers: BoardMarker[];
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  onMarkerTicket: (m: BoardMarker) => void;
  onMarkerRemove: (m: BoardMarker) => void;
  /** Open this ticket's card straight away (Techs page tap, scanned ticket). A new object = open it again. */
  focus?: { id: number } | null;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const NO_COLOR = "#454c56";

export function CheckInBoard(p: Props) {
  const [openId, setOpenId] = useState<number | null>(p.focus?.id ?? null);
  useEffect(() => { if (p.focus) setOpenId(p.focus.id); }, [p.focus]);
  const [openMarker, setOpenMarker] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const waiting = p.tickets.filter((t) => t.status === "confirmed");
  const inService = p.tickets.filter((t) => t.status === "started");
  const waitingCount = waiting.length + p.markers.length;
  const open = p.tickets.find((t) => t.id === openId) ?? null;
  const marker = p.markers.find((m) => m.id === openMarker) ?? null;

  const card = (t: BoardTicket) => {
    const inChair = t.status === "started";
    const since = inChair ? t.startedAt ?? t.date : t.checkedInAt ?? t.date;
    const future = !inChair && new Date(t.date).getTime() - now > 60_000;
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
            <span>
              <Clock size={11} /> {future ? `Next up ~${fmtTime(t.date)}` : `${inChair ? "In chair" : "Waiting"} ${formatElapsed(since, now)}`}
            </span>
          </div>
          <div className="checkin-card-right">
            <span className="checkin-card-total">${t.total.toFixed(2)}</span>
            <div className="checkin-status-pill" data-in-service={inChair}>{inChair ? "IN SERVICE" : "WAITING"}</div>
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
        <h1>Checked-In Clients</h1>
        <p>Tap a card to expand — manage the client from the dock</p>
      </div>
      <div className={`checkin-columns ${waitingCount === 0 ? "checkin-columns-full" : ""}`}>
        {waitingCount > 0 && (
          <div className="checkin-column checkin-column-waiting" data-testid="nail-col-waiting">
            <div className="checkin-column-header">
              <h2>Waiting</h2>
              <span className="checkin-count">{waitingCount}</span>
            </div>
            <div className="checkin-card-list">
              {p.markers.map((m) => (
                <div key={`m${m.id}`} className="checkin-card checkin-card-marker" onClick={() => setOpenMarker(m.id)} data-testid={`nail-marker-${m.id}`}>
                  <div className="checkin-card-header" style={{ borderLeftColor: NO_COLOR }}>
                    <div className="checkin-client">
                      <div className="checkin-card-name-row"><strong>{m.clientName || "Guest"}</strong></div>
                      <span>Checked in at the kiosk · no ticket yet</span>
                      <span><Clock size={11} /> Waiting {formatElapsed(m.createdAt, now)}</span>
                    </div>
                    <div className="checkin-status-pill" data-in-service="false">NO TICKET</div>
                  </div>
                </div>
              ))}
              {waiting.map(card)}
            </div>
          </div>
        )}
        <div className="checkin-column checkin-column-service" data-testid="nail-col-service">
          <div className="checkin-column-header">
            <h2>In Service</h2>
            <span className="checkin-count">{inService.length}</span>
          </div>
          <div className="checkin-card-list">
            {inService.length === 0 ? (
              <div className="checkin-empty">
                <Hand size={32} />
                <p>No clients in service</p>
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
                  {open.status === "started" ? "IN SERVICE" : "WAITING"}
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
                  <div><small>Duration</small><strong>{formatDuration(open.duration)}</strong></div>
                </div>
                <div className="checkin-modal-detail">
                  <CalendarDays size={18} />
                  <div><small>Total</small><strong>${open.total.toFixed(2)}</strong></div>
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

      {marker && (
        <>
          <div className="assign-create-overlay" onClick={() => setOpenMarker(null)} />
          <div className="assign-create-modal" data-testid="nail-marker-modal">
            <div className="assign-create-header">
              <div>
                <h2>{marker.clientName || "Guest"}</h2>
                <p>{marker.phone ?? "Checked in at the kiosk"}</p>
              </div>
              <button type="button" className="assign-create-close" onClick={() => setOpenMarker(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="assign-create-hint">They checked in at the kiosk but don't have a ticket yet.</div>
            <div className="assign-create-footer">
              <button type="button" className="assign-create-skip" onClick={() => { p.onMarkerRemove(marker); setOpenMarker(null); }}>REMOVE</button>
              <button type="button" className="assign-create-btn assign-create-btn-ready" data-testid="nail-marker-create"
                onClick={() => { p.onMarkerTicket(marker); setOpenMarker(null); }}>CREATE TICKET</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
