import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, ChevronRight, ArrowUp } from "lucide-react";
import { api, type Ticket } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function EscalationsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["support-tickets-escalations"],
    queryFn: () => api.tickets.list({ filter: "high_priority", page: 1 }),
    staleTime: 30_000,
  });

  const tickets: Ticket[] = data?.tickets ?? [];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Escalations</h1>
            <p className="text-slate-500 text-sm mt-1">High-priority and escalated support tickets requiring urgent attention</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{tickets.length} open escalation{tickets.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-10">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading escalations…
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={26} className="text-emerald-400" />
            </div>
            <p className="text-slate-700 font-semibold">No open escalations</p>
            <p className="text-slate-400 text-sm mt-1">All high-priority tickets are resolved or unassigned.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`/tickets/${t.id}`)}
                className="w-full bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md p-4 flex items-center gap-4 text-left transition group"
              >
                <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ArrowUp size={16} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-slate-800 text-sm truncate">{t.subject}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority] ?? "bg-slate-100 text-slate-600"}`}>
                      {t.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {t.account_name && <span>{t.account_name}</span>}
                    <span>#{t.ticket_number}</span>
                    {t.assigned_agent_name && <span>→ {t.assigned_agent_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-right">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock size={11} />
                    {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                  </div>
                  <ChevronRight size={15} className="text-slate-400 group-hover:text-indigo-500 transition" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
