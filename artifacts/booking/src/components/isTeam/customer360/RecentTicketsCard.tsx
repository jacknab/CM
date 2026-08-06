import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Ticket, Plus, ExternalLink } from "lucide-react";
import { supportApi, type Ticket as TicketType } from "@/lib/support-api";
import { StatusBadge } from "../ui/StatusBadge";
import { safeDistanceToNow } from "@/lib/utils";

const priorityColors: Record<string, string> = { urgent: "text-red-600", high: "text-orange-600", normal: "text-slate-600", low: "text-slate-400" };

export default function RecentTicketsCard({ accountId, showCreate }: { accountId: number; showCreate?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal" });

  const { data: tickets = [], isLoading } = useQuery<TicketType[]>({
    queryKey: ["support-tickets", accountId],
    queryFn: () => supportApi.accounts.tickets(accountId),
    staleTime: 30_000,
  });

  const createTicket = useMutation({
    mutationFn: () => supportApi.accounts.createTicket(accountId, form),
    onSuccess: () => { setCreating(false); setForm({ subject: "", description: "", priority: "normal" }); qc.invalidateQueries({ queryKey: ["support-tickets", accountId] }); },
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket size={14} className="text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-700">Recent Tickets</h3>
          {tickets.length > 0 && <span className="text-[10px] bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">{tickets.length}</span>}
        </div>
        <button onClick={() => setCreating(c => !c)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition font-medium"><Plus size={12} />New</button>
      </div>
      {creating && (
        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 space-y-2">
          <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject" className="w-full text-xs border border-violet-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-violet-400 bg-white" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" className="w-full text-xs border border-violet-200 rounded-lg px-2.5 py-2 focus:outline-none bg-white resize-none" rows={2} />
          <div className="flex items-center justify-between gap-2">
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="text-xs border border-violet-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => createTicket.mutate()} disabled={!form.subject.trim() || createTicket.isPending} className="text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition font-medium">{createTicket.isPending ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
      <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
        {isLoading ? <div className="p-4 flex justify-center"><div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /></div>
          : tickets.length === 0 ? <div className="p-6 text-center"><Ticket size={20} className="text-slate-200 mx-auto mb-2" /><p className="text-xs text-slate-400">No tickets found</p></div>
          : <div className="divide-y divide-slate-50">
              {tickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/isTeam/tickets?ticketId=${t.id}`)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase ${priorityColors[t.priority] ?? "text-slate-600"}`}>{t.priority}</span>
                      <StatusBadge status={t.status} size="xs" />
                    </div>
                    <p className="text-xs text-slate-700 font-medium truncate mt-0.5">{t.subject}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t.ticket_number} · {safeDistanceToNow(t.created_at, { addSuffix: true })}</p>
                  </div>
                  <ExternalLink size={11} className="text-slate-300 group-hover:text-violet-400 transition flex-shrink-0" />
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
