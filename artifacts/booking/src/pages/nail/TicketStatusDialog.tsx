import { CheckCircle2, Clock, UserX, X, XCircle } from "lucide-react";

export interface LookupTicketStatus {
  appointmentId: number;
  ticketNumber: number | null;
  clientName: string;
  service: string;
  date: string;
  status: string;
  isPaid: boolean;
}

const STATUS_VIEW: Record<string, { label: string; icon: typeof XCircle; color: string; bg: string }> = {
  cancelled:  { label: "Cancelled", icon: XCircle, color: "#ef5a5f", bg: "#fdecec" },
  no_show:    { label: "No-Show", icon: UserX, color: "#c17d1f", bg: "#fbf1de" },
  "no-show":  { label: "No-Show", icon: UserX, color: "#c17d1f", bg: "#fbf1de" },
  completed:  { label: "Paid", icon: CheckCircle2, color: "#0c8a55", bg: "#e7f6ee" },
  pending:    { label: "Not Checked In", icon: Clock, color: "#5b6b85", bg: "#eef2f8" },
  // A kiosk check-in that never got a ticket and is no longer waiting.
  checkin_expired: { label: "Check-in expired", icon: Clock, color: "#5b6b85", bg: "#eef2f8" },
};

/**
 * Read-only fallback for a ticket number that resolved to a real appointment but isn't on
 * today's live board (see NailHome.tsx's applyLookupResult) — a cancelled ticket, a no-show, or
 * a completed one with no receipt token to open instead. There's nothing "live" to open for any
 * of these, so this just shows what the record says rather than erroring as if it didn't exist.
 */
export function TicketStatusDialog({ ticket, onClose }: { ticket: LookupTicketStatus; onClose: () => void }) {
  const view = STATUS_VIEW[ticket.status] ?? { label: ticket.status, icon: Clock, color: "#5b6b85", bg: "#eef2f8" };
  const Icon = view.icon;

  return (
    <>
      <div className="checkin-overlay" onClick={onClose} />
      <div className="checkin-modal-wrapper" onClick={onClose}>
        <div className="checkin-modal-card" onClick={(e) => e.stopPropagation()} data-testid="nail-ticket-status">
          <button type="button" className="checkin-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
          <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 28, background: view.bg,
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
            }}>
              <Icon size={28} color={view.color} />
            </div>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", color: view.color, textTransform: "uppercase", marginBottom: 6 }}>
              {view.label}
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2, textAlign: "center" }}>{ticket.clientName}</h2>
            <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 16, textAlign: "center" }}>{ticket.service}</p>

            <div style={{ width: "100%", borderTop: "1px solid var(--border, #333)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {ticket.ticketNumber != null && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ opacity: 0.6 }}>Ticket</span>
                  <span style={{ fontWeight: 600 }}>#{ticket.ticketNumber}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ opacity: 0.6 }}>Date</span>
                <span style={{ fontWeight: 600 }}>{ticket.date}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
