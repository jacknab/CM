import { Hand, X } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <section className="w-[340px] shrink-0 flex flex-col bg-card border-r border-border min-h-0" data-testid="nail-ticket-panel">
      {client && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/40 shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-bold truncate" data-testid="nail-ticket-client">{client.name}</div>
            <div className="text-[11px] font-semibold text-primary tracking-wide">{client.loyaltyPoints} pts</div>
          </div>
          <div className="text-[13px] font-bold tabular-nums text-muted-foreground">{badge}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center text-muted-foreground">
            <Hand className="w-9 h-9 opacity-50" />
            <p className="text-[13px] leading-relaxed max-w-[220px]">
              {client ? "Pick a service to build the ticket" : "Start a walk-in to begin a ticket"}
            </p>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.key} className="flex items-center gap-2 px-4 py-3 border-b border-border" data-testid={`nail-line-${line.kind}`}>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[13px] truncate", line.kind === "service" ? "font-bold" : "font-medium")}>{line.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {line.note ?? (line.duration > 0 ? formatDuration(line.duration) : "No added time")}
                </div>
              </div>
              <div className="text-[13px] font-bold tabular-nums">${line.price.toFixed(2)}</div>
              {line.kind !== "service" && (
                <button type="button" onClick={() => onRemove(line)} aria-label={`Remove ${line.label}`}
                  className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background/40 px-4 pt-3 pb-3 space-y-2">
        {lines.length > 0 && (
          <>
            <div className="flex justify-between text-[11px] font-semibold tracking-wide text-muted-foreground">
              <span>EST. TIME</span>
              <span className="text-primary text-[13px]">{formatDuration(duration)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-border">
              <span className="text-[13px] font-semibold text-muted-foreground">TOTAL</span>
              <span className="text-[20px] font-bold tabular-nums" data-testid="nail-ticket-total">${price.toFixed(2)}</span>
            </div>
          </>
        )}
        {missing.length > 0 && (
          <div className="text-[11px] text-muted-foreground">Choose {missing.join(", ")} to continue.</div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClear} disabled={lines.length === 0 && !editing}
            className="h-12 w-[72px] shrink-0 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-40">
            {editing ? "CANCEL" : "CLR"}
          </button>
          <button type="button" onClick={onSubmit} disabled={!canSubmit || busy} data-testid="nail-submit-ticket"
            className="h-12 flex-1 rounded-md bg-primary text-primary-foreground text-[14px] font-bold tracking-wide disabled:opacity-40">
            {busy ? "WORKING…" : submitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
