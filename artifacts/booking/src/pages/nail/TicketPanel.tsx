import { Hand, X } from "lucide-react";
import { formatDuration, groupCartLines, type TicketLine } from "./ticketDraft";

interface Props {
  client: { name: string; loyaltyPoints: number } | null;
  /** Shown top-right, e.g. "#12" while editing or "NEW" while building. */
  badge: string;
  lines: TicketLine[];
  duration: number;
  price: number;
  submitLabel: string;
  canSubmit: boolean;
  busy: boolean;
  /** What still blocks the ticket ("length", "shape"…). */
  editing: boolean;
  onRemove: (line: TicketLine) => void;
  onClear: () => void;
  onSubmit: () => void;
  /** A booking being made: when and with whom, shown under the services ("Sat, Oct 18 · 10:30 AM · Amy"). */
  appointment?: string | null;
  /** The line chosen for Split Ticket, and how a line is chosen (only lines that can be split are offered). */
  selectedKey?: string | null;
  onSelect?: (line: TicketLine) => void;
}

export function TicketPanel({ client, badge, lines, duration, price, submitLabel, canSubmit, busy, editing, onRemove, onClear, onSubmit, appointment, selectedKey, onSelect }: Props) {
  return (
    <section className="ticket-panel" data-testid="nail-ticket-panel">
      {client && (
        <div className="ticket-client-header">
          <div className="ticket-client-main">
            <div className="ticket-client-name" data-testid="nail-ticket-client">{client.name}</div>
            <div className="ticket-client-points">{client.loyaltyPoints} pts</div>
          </div>
          <div className="ticket-client-num">{badge}</div>
        </div>
      )}

      <div className="ticket-items">
        {lines.length === 0 ? (
          <div className="empty-ticket">
            <Hand size={36} />
            <p>{client ? "Add services from the catalog to build the ticket" : "Check a client in, then open them from the Queue to build their ticket — or tap Retail to sell a product"}</p>
          </div>
        ) : (
          // Identical items show as one line with a quantity, like a register (groupCartLines); × takes off one.
          groupCartLines(lines).map((line) => {
            const picked = !!selectedKey && line.members.some((m) => m.key === selectedKey);
            return (
            <div className={`ticket-item ticket-item-${line.kind} ${picked ? "ticket-item-selected" : ""}`} key={line.key} data-testid={`nail-line-${line.kind}`}
              onClick={onSelect ? () => onSelect(line.members[0]) : undefined} aria-selected={picked || undefined} data-qty={line.qty}>
              <div className="item-copy">
                <strong>{line.qty > 1 ? <span className="item-qty">{line.qty} × </span> : null}{line.label}</strong>
                <span className={line.note ? "note" : undefined}>
                  {line.note ?? (line.duration > 0 ? formatDuration(line.duration) : "No duration")}
                </span>
              </div>
              <div className="item-price">
                <strong>{line.price < 0 ? "-" : ""}${Math.abs(line.price).toFixed(2)}</strong>
              </div>
              {line.kind !== "service" || line.removable || line.qty > 1 ? (
                <button type="button" className="remove-item" onClick={(e) => { e.stopPropagation(); onRemove(line.members[line.members.length - 1]); }} aria-label={line.qty > 1 ? `Remove one ${line.label}` : `Remove ${line.label}`}>
                  <X size={16} />
                </button>
              ) : <span />}
            </div>
            );
          })
        )}
      </div>

      <div className="ticket-total">
        {appointment && (
          <div className="time-estimate" data-testid="nail-ticket-appointment">
            <span>BOOKING</span>{" "}<strong>{appointment}</strong>
          </div>
        )}
        {lines.length > 0 && duration > 0 && (
          <div className="time-estimate">
            <span>EST. TIME</span>{" "}
            <strong>{formatDuration(duration)}</strong>
          </div>
        )}
        {lines.length > 0 && (
          <div className="grand-total">
            <span>TOTAL</span>
            <strong data-testid="nail-ticket-total">${price.toFixed(2)}</strong>
          </div>
        )}
        <div className="checkout-row">
          <button type="button" className="checkout-clr" onClick={onClear} disabled={lines.length === 0 && !editing && !client}>
            {editing ? "CANCEL" : "CLR"}
          </button>
          <button type="button" className={`checkout ${!canSubmit || busy ? "disabled" : ""}`} onClick={onSubmit} disabled={!canSubmit || busy} data-testid="nail-submit-ticket">
            {busy ? "WORKING…" : submitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
