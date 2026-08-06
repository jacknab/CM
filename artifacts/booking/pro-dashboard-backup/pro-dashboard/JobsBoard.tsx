import { useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, Clock, MapPin, ChevronRight, Trash2, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_COLOR: Record<string, string> = {
  new: "#64748b", assigned: "#3b82f6", en_route: "#f59e0b",
  in_progress: "#00D4AA", completed: "#22c55e", cancelled: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = {
  new: "New", assigned: "Assigned", en_route: "En Route",
  in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};
const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-white/10 text-white/40", normal: "bg-blue-500/15 text-blue-400",
  high: "bg-yellow-500/15 text-yellow-400", emergency: "bg-red-500/20 text-red-400",
};

export default function JobsBoard() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/orders", storeId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId: String(storeId) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await fetch(`/api/pro-dashboard/orders?${params}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/pro-dashboard/orders/${id}?storeId=${storeId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/orders"] }),
  });

  const filtered = orders.filter((o: any) =>
    !search || o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    o.serviceType?.toLowerCase().includes(search.toLowerCase()) ||
    o.orderNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const statusGroups = ["new", "assigned", "en_route", "in_progress", "completed", "cancelled"];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-white">Jobs</h1>
          <p className="text-white/40 text-xs mt-0.5">{orders.length} total jobs</p>
        </div>
        <Link to="/pro-dashboard/jobs/new" className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00D4AA] text-[#050C18] font-bold text-sm hover:bg-[#00D4AA]/90 transition-all">
          <Plus className="w-4 h-4" /> New Job
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs…" className="pl-9 bg-white/5 border-white/15 text-white placeholder:text-white/25 h-9 rounded-xl" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-white/5 border-white/15 text-white h-9 rounded-xl">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="bg-[#0D1F35] border-white/15 text-white">
            <SelectItem value="all" className="text-white focus:bg-white/10">All Statuses</SelectItem>
            {statusGroups.map(s => (
              <SelectItem key={s} value={s} className="text-white focus:bg-white/10">{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-6 gap-2 mb-6">
        {statusGroups.map(s => {
          const count = orders.filter((o: any) => o.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`text-center py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${statusFilter === s ? "border-[#00D4AA]/40 bg-[#00D4AA]/10 text-[#00D4AA]" : "border-white/8 bg-white/4 text-white/50 hover:bg-white/8"}`}>
              <div className="text-lg font-black mb-0.5" style={{ color: STATUS_COLOR[s] }}>{count}</div>
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      {/* Jobs list */}
      {isLoading ? (
        <div className="text-white/30 text-sm text-center py-16">Loading jobs…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/30 text-sm">No jobs found</p>
          <Link to="/pro-dashboard/jobs/new" className="text-[#00D4AA] text-sm mt-2 hover:underline block">Create your first job →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order: any) => (
            <Link to={`/pro-dashboard/jobs/${order.id}`} key={order.id}
              className="flex items-center gap-4 bg-white/4 hover:bg-white/7 border border-white/8 rounded-2xl px-5 py-4 transition-all group">
              {/* Status indicator */}
              <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[order.status] }} />

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-bold text-sm">{order.customerName}</span>
                  <span className="text-white/30 text-xs">·</span>
                  <span className="text-white/50 text-xs">{order.orderNumber}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORITY_BADGE[order.priority] ?? PRIORITY_BADGE.normal}`}>{order.priority}</span>
                </div>
                <p className="text-white/60 text-sm">{order.serviceType}</p>
                {order.address && (
                  <p className="text-white/30 text-xs flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />{order.address}{order.city ? `, ${order.city}` : ""}
                  </p>
                )}
              </div>

              {/* Crew */}
              <div className="text-right flex-shrink-0">
                {order.crew ? (
                  <div className="flex items-center gap-1.5 justify-end">
                    <div className="w-4 h-4 rounded-full" style={{ background: order.crew.color }} />
                    <span className="text-white/60 text-xs">{order.crew.name}</span>
                  </div>
                ) : (
                  <span className="text-white/25 text-xs">Unassigned</span>
                )}
                {order.scheduledAt && (
                  <p className="text-white/30 text-[10px] flex items-center justify-end gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(order.scheduledAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Status badge */}
              <div className="flex-shrink-0">
                <span className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: STATUS_COLOR[order.status] + "33", color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}40` }}>
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
