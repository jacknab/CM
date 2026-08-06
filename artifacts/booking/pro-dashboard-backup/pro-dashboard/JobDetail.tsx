import { useContext, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { ArrowLeft, MapPin, Clock, User, Wrench, MessageSquare, Send, Edit2, Trash2, ChevronDown } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_COLOR: Record<string, string> = {
  new: "#64748b", assigned: "#3b82f6", en_route: "#f59e0b",
  in_progress: "#00D4AA", completed: "#22c55e", cancelled: "#ef4444",
};
const STATUS_FLOW = ["new", "assigned", "en_route", "in_progress", "completed"];
const STATUS_LABEL: Record<string, string> = {
  new: "New", assigned: "Assigned", en_route: "En Route",
  in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};
const PRIORITY_COLOR: Record<string, string> = { low: "#64748b", normal: "#3b82f6", high: "#f59e0b", emergency: "#ef4444" };

export default function JobDetail() {
  const { id } = useParams();
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [showDeleteJobDialog, setShowDeleteJobDialog] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/orders", id, storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/orders/${id}?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId && !!id,
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["/api/pro-dashboard/crews", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/crews?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const updateOrder = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const r = await fetch(`/api/pro-dashboard/orders/${id}?storeId=${storeId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/orders", id, storeId] }),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      await fetch(`/api/pro-dashboard/orders/${id}/notes?storeId=${storeId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, authorName: "Office" }),
      });
    },
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/orders", id, storeId] });
    },
  });

  const deleteOrder = useMutation({
    mutationFn: async () => {
      await fetch(`/api/pro-dashboard/orders/${id}?storeId=${storeId}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/orders"] }); navigate("/pro-dashboard/jobs"); },
  });

  if (isLoading) return <div className="p-6 text-white/30">Loading…</div>;
  if (!order || order.error) return <div className="p-6 text-white/30">Order not found</div>;

  const statusIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <Link to="/pro-dashboard/jobs" className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Jobs
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-extrabold text-white">{order.orderNumber}</h1>
            <span className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: STATUS_COLOR[order.status] }}>
              {STATUS_LABEL[order.status]}
            </span>
            <span className="text-xs font-bold uppercase" style={{ color: PRIORITY_COLOR[order.priority] }}>{order.priority}</span>
          </div>
          <p className="text-white/50 text-sm">{order.serviceType}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDeleteJobDialog(true)}
            className="p-2 rounded-xl border border-red-500/20 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4 mb-5">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Job Status</p>
        <div className="flex items-center gap-1">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => updateOrder.mutate({ status: s })}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${i <= statusIdx ? "text-white" : "text-white/30 hover:text-white/60"}`}
                style={{ background: i <= statusIdx ? STATUS_COLOR[s] : "rgba(255,255,255,0.05)" }}
              >
                {STATUS_LABEL[s]}
              </button>
              {i < STATUS_FLOW.length - 1 && <div className={`w-3 h-0.5 flex-shrink-0 ${i < statusIdx ? "bg-white/30" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Customer */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Customer</h3>
          </div>
          <p className="text-white font-semibold">{order.customerName}</p>
          {order.customerPhone && <p className="text-white/50 text-sm">{order.customerPhone}</p>}
          {order.customerEmail && <p className="text-white/50 text-sm">{order.customerEmail}</p>}
        </div>

        {/* Location */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Job Location</h3>
          </div>
          <p className="text-white/70 text-sm">{order.address}</p>
          {(order.city || order.state) && <p className="text-white/50 text-sm">{[order.city, order.state, order.zip].filter(Boolean).join(", ")}</p>}
          {order.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(order.address + " " + (order.city ?? ""))}`} target="_blank" rel="noreferrer"
              className="text-[#00D4AA] text-xs mt-2 hover:underline block">Open in Maps →</a>
          )}
        </div>

        {/* Crew assignment */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Crew Assignment</h3>
          </div>
          <Select value={order.crewId ? String(order.crewId) : ""} onValueChange={v => updateOrder.mutate({ crewId: v ? Number(v) : null, status: v && order.status === "new" ? "assigned" : order.status })}>
            <SelectTrigger className="bg-white/6 border-white/15 text-white h-10 rounded-xl w-full">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent className="bg-[#0D1F35] border-white/15 text-white">
              <SelectItem value="" className="text-white focus:bg-white/10">Unassigned</SelectItem>
              {crews.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)} className="text-white focus:bg-white/10">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ background: c.color }} />{c.name}</div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Scheduling */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Schedule</h3>
          </div>
          <div className="space-y-2">
            {order.scheduledAt && <p className="text-white/70 text-sm">Scheduled: {new Date(order.scheduledAt).toLocaleString()}</p>}
            {order.estimatedHours && <p className="text-white/50 text-sm">Est. {order.estimatedHours} hrs</p>}
            {order.startedAt && <p className="text-white/50 text-sm">Started: {new Date(order.startedAt).toLocaleString()}</p>}
            {order.completedAt && <p className="text-green-400 text-sm">Completed: {new Date(order.completedAt).toLocaleString()}</p>}
            {!order.scheduledAt && !order.startedAt && <p className="text-white/30 text-sm">Not scheduled</p>}
          </div>
        </div>
      </div>

      {/* Description */}
      {order.description && (
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4 mb-5">
          <h3 className="text-white font-bold text-sm mb-2">Description</h3>
          <p className="text-white/60 text-sm whitespace-pre-wrap">{order.description}</p>
        </div>
      )}

      {/* Notes */}
      <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-[#00D4AA]" />
          <h3 className="text-white font-bold text-sm">Job Notes ({(order.notes ?? []).length})</h3>
        </div>
        <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
          {(order.notes ?? []).length === 0 ? (
            <p className="text-white/25 text-sm">No notes yet</p>
          ) : (
            (order.notes ?? []).map((n: any) => (
              <div key={n.id} className="bg-white/5 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/60 text-xs font-semibold">{n.authorName ?? "Office"}</span>
                  <span className="text-white/25 text-[10px]">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-white/80 text-sm">{n.note}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && note.trim()) addNote.mutate(); }}
            placeholder="Add a note…"
            className="flex-1 bg-white/6 border border-white/15 text-white placeholder:text-white/25 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#00D4AA]/50" />
          <button onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending}
            className="px-3 py-2 rounded-xl bg-[#00D4AA] text-[#050C18] disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AlertDialog open={showDeleteJobDialog} onOpenChange={setShowDeleteJobDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This job will be permanently deleted and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setShowDeleteJobDialog(false); deleteOrder.mutate(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
