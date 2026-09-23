import { useEffect, useState } from "react";
import { Clock, Hand, UserRound } from "lucide-react";
import { formatElapsed } from "./ticketDraft";
import { TicketPopup } from "./TicketPopup";
import type { BoardTicket } from "./nailApi";

interface Props {
  tickets: BoardTicket[];
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  /** Server clock minus this device's clock, so times read the same on every POS station. */
  clockOffsetMs?: number;
}

const NO_COLOR = "#454c56";

/**
 * The tickets that are IN SERVICE and not paid yet — the front desk's list of who to check out. (Clients who are still
 * waiting live on the Techs page's Checked In list; this tab is only for tickets already in the chair.)
 */
export function CheckInBoard(p: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
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
        <TicketPopup ticket={open} busy={p.busy} clockOffsetMs={p.clockOffsetMs} onClose={() => setOpenId(null)}
          onStart={p.onStart} onCheckout={p.onCheckout} onReassign={p.onReassign} onEdit={p.onEdit} onCancel={p.onCancel} />
      )}
    </section>
  );
}
