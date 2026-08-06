import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, MessageSquare, StickyNote, CheckSquare, GitMerge,
  MoreHorizontal, Ticket,
} from "lucide-react";
import { api, type TicketDetail } from "@/lib/api";
import TicketQueuePanel from "@/components/tickets/TicketQueuePanel";
import TicketConversationPanel from "@/components/tickets/TicketConversationPanel";
import TicketSidebar from "@/components/tickets/TicketSidebar";
import { clsx } from "clsx";

export default function TicketWorkspacePage() {
  const { ticketId: ticketIdStr } = useParams<{ ticketId?: string }>();
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const ticketId    = ticketIdStr ? parseInt(ticketIdStr) : null;
  const hasTicket   = !!ticketId && !isNaN(ticketId);

  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { data: detail } = useQuery<TicketDetail>({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => api.tickets.get(ticketId!),
    enabled: hasTicket,
    staleTime: 15_000,
  });

  const handleUpdated = () => {
    if (ticketId) {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-ticket-queue"] });
    }
  };

  const ticket = detail?.ticket;

  const handleResolve = async () => {
    if (!ticket) return;
    const newStatus = ticket.status === "resolved" ? "open" : "resolved";
    await api.tickets.update(ticket.id, { status: newStatus });
    handleUpdated();
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Queue Panel ─────────────────────────────────────────────── */}
      <TicketQueuePanel activeTicketId={ticketId} />

      {/* ── Center + Right: Workspace ──────────────────────────────────────── */}
      {!hasTicket ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* ── Top Action Bar ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
              {/* Back */}
              <button
                onClick={() => navigate("/tickets")}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-medium transition mr-2 flex-shrink-0"
              >
                <ArrowLeft size={13} />
                <span>Back to tickets</span>
              </button>

              <div className="flex-1" />

              {/* Action buttons matching screenshot */}
              <div className="flex items-center gap-1.5">
                <ActionBtn
                  icon={<MessageSquare size={12} />}
                  label="Reply"
                  onClick={() => {}}
                />
                <ActionBtn
                  icon={<StickyNote size={12} />}
                  label="Add Internal Note"
                  onClick={() => {}}
                />
                <ActionBtn
                  icon={<CheckSquare size={12} />}
                  label="Create Task"
                  onClick={() => {}}
                />
                <ActionBtn
                  icon={<GitMerge size={12} />}
                  label="Merge Ticket"
                  onClick={() => {}}
                />

                {/* More Actions dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowMoreMenu(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition"
                  >
                    More Actions
                    <MoreHorizontal size={12} />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-xl z-30 py-1">
                      {[
                        { label: ticket?.status === "resolved" ? "Re-open Ticket" : "Resolve Ticket", onClick: handleResolve },
                        { label: "Close Ticket",      onClick: () => { api.tickets.update(ticket!.id, { status: "closed" }).then(handleUpdated); setShowMoreMenu(false); } },
                        { label: "Escalate",          onClick: () => setShowMoreMenu(false) },
                        { label: "Change Priority",   onClick: () => setShowMoreMenu(false) },
                        { label: "Assign to Agent",   onClick: () => setShowMoreMenu(false) },
                      ].map(item => (
                        <button
                          key={item.label}
                          onClick={() => { item.onClick(); setShowMoreMenu(false); }}
                          className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation panel fills rest */}
            <TicketConversationPanel
              ticketId={ticketId!}
              onTicketUpdate={handleUpdated}
            />
          </div>

          {/* Right: Sidebar */}
          <TicketSidebar
            ticketId={ticketId!}
            detail={detail}
            onUpdated={handleUpdated}
          />
        </>
      )}
    </div>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, onClick, variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "primary" | "default";
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap",
        variant === "primary"
          ? "bg-indigo-600 hover:bg-indigo-700 text-white"
          : "border border-slate-200 hover:bg-slate-50 text-slate-700"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-center px-6">
      <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
        <Ticket size={28} className="text-slate-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">Select a Ticket</h3>
      <p className="text-sm text-slate-400 max-w-xs">
        Choose a ticket from the queue on the left to start working on it.
      </p>
    </div>
  );
}
