import { Hand, X } from "lucide-react";
import { formatDuration, type TicketLine } from "./ticketDraft";

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
  missing: string[];
  editing: boolean;
  onRemove: (line: TicketLine) => void;
  onClear: () => void;
  onSubmit: () => void;
}

export function TicketPanel({ client, badge, lines, duration, price, submitLabel, canSubmit, busy, missing, editing, onRemove, onClear, onSubmit }: Props) {
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
            <p>{client ? "Add services from the catalog to build the ticket" : "Start a Walk-In ticket to begin ringing up services"}</p>
          </div>
        ) : (
          lines.map((line) => (
            <div className="ticket-item" key={line.key} data-testid={`nail-line-${line.kind}`}>
              <div className="item-copy">
                <strong>{line.label}</strong>
                <span className={line.note ? "note" : undefined}>
                  {line.note ?? (line.duration > 0 ? formatDuration(line.duration) : "No duration")}
                </span>
              </div>
              <div className="item-price">
                <strong>${line.price.toFixed(2)}</strong>
              </div>
              {line.kind !== "service" ? (
                <button type="button" className="remove-item" onClick={() => onRemove(line)} aria-label={`Remove ${line.label}`}>
                  <X size={16} />
                </button>
              ) : <span />}
            </div>
          ))
        )}
      </div>

      <div className="ticket-total">
        {lines.length > 0 && duration > 0 && (
          <div className="time-estimate">
            <span>EST. TIME</span>{" "}
            <strong>{formatDuration(duration)}</strong>
          </div>
        )}
        {missing.length > 0 && <div className="ticket-missing">Choose {missing.join(", ")} to continue.</div>}
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
