import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, XCircle, RotateCcw, ChevronRight, ArrowLeft, Clock, Users, Calendar, Package, Gift, Sparkles, Loader2 } from "lucide-react";

const BASE = "/api/data-transfer";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `Request failed ${r.status}`); }
  return r.json() as Promise<T>;
}

interface TransferJob {
  id: number; store_id: number; store_name: string; user_email: string; user_name: string;
  mode: string; status: string; source_platform: string;
  files_json: Array<{ type: string; name: string; rows: number }>;
  preview_json: Record<string, { totalRows: number; headers: string[]; sample: any[] }>;
  imported_counts_json: Record<string, number>;
  review_notes: string | null; reject_reason: string | null; created_at: string; completed_at: string | null;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "Needs Review", cls: "bg-yellow-100 text-yellow-800" },
  approved:       { label: "Approved",     cls: "bg-blue-100 text-blue-800" },
  processing:     { label: "Processing",   cls: "bg-blue-100 text-blue-800" },
  completed:      { label: "Completed",    cls: "bg-green-100 text-green-700" },
  failed:         { label: "Failed",       cls: "bg-red-100 text-red-700" },
  rolled_back:    { label: "Rolled Back",  cls: "bg-gray-100 text-gray-500" },
};

function StatusPill({ status }: { status: string }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

const DATA_ICONS: Record<string, React.ElementType> = {
  clients: Users, appointments: Calendar, services: Sparkles, products: Package, giftCards: Gift,
};

export default function TeamDataTransferQueuePage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: jobs = [], isLoading } = useQuery<TransferJob[]>({
    queryKey: ["support-dt-queue"],
    queryFn: () => req("/support/queue"),
    refetchInterval: 15000,
  });

  const { data: job, isLoading: jobLoading } = useQuery<TransferJob>({
    queryKey: ["support-dt-job", selectedId],
    queryFn: () => req(`/support/jobs/${selectedId}`),
    enabled: !!selectedId,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["support-dt-queue"] }); qc.invalidateQueries({ queryKey: ["support-dt-job", selectedId] }); };

  const approveMut  = useMutation({ mutationFn: () => req(`/support/jobs/${selectedId}/approve`,  { method: "POST", body: JSON.stringify({ review_notes: reviewNotes }) }), onSuccess: invalidate });
  const rejectMut   = useMutation({ mutationFn: () => req(`/support/jobs/${selectedId}/reject`,   { method: "POST", body: JSON.stringify({ reason: rejectReason }) }),    onSuccess: () => { setShowReject(false); invalidate(); } });
  const rollbackMut = useMutation({ mutationFn: (id: number) => req(`/support/jobs/${id}/rollback`, { method: "POST" }), onSuccess: invalidate });

  if (selectedId) {
    if (jobLoading) return <div className="p-8 flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading job…</div>;
    if (!job) return <div className="p-8 text-slate-400">Job not found.</div>;

    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></button>
          <div><h2 className="text-lg font-bold text-slate-800">Transfer Job #{job.id}</h2><p className="text-sm text-slate-400">{job.store_name} — {job.user_email}</p></div>
          <StatusPill status={job.status} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-400">Platform</span><p className="font-medium text-slate-800 capitalize mt-0.5">{job.source_platform}</p></div>
          <div><span className="text-slate-400">Mode</span><p className="font-medium text-slate-800 mt-0.5 capitalize">{job.mode.replace("_", " ")}</p></div>
          <div><span className="text-slate-400">Submitted</span><p className="font-medium text-slate-800 mt-0.5">{format(new Date(job.created_at), "MMM d, yyyy h:mm a")}</p></div>
          <div><span className="text-slate-400">Account</span><p className="font-medium text-slate-800 mt-0.5">{job.user_name}</p></div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Uploaded Files</p>
          {(job.files_json ?? []).map((f, i) => {
            const Icon = DATA_ICONS[f.type] ?? Users;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><Icon className="w-4 h-4 text-indigo-500" /></div>
                <div><p className="text-sm font-medium text-slate-800 capitalize">{f.type}</p><p className="text-xs text-slate-400">{f.name} — {f.rows} rows</p></div>
              </div>
            );
          })}
        </div>

        {Object.entries(job.preview_json ?? {}).map(([dataType, info]) => {
          const Icon = DATA_ICONS[dataType] ?? Users;
          return (
            <div key={dataType} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" /><p className="text-sm font-semibold text-slate-800 capitalize">{dataType} — {info.totalRows} rows</p></div>
              {info.sample?.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50">{info.headers?.slice(0, 6).map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-500 truncate max-w-[120px]">{h}</th>)}</tr></thead>
                    <tbody>{info.sample.slice(0, 5).map((row, ri) => <tr key={ri} className="border-t border-slate-100">{info.headers?.slice(0, 6).map(h => <td key={h} className="px-2 py-1.5 text-slate-600 truncate max-w-[120px]">{String(row[h] ?? "")}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {job.status === "completed" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-emerald-700 mb-2">Import Results</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(job.imported_counts_json ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-slate-500 capitalize">{k}</span><span className="font-medium text-slate-800">{v}</span></div>
              ))}
            </div>
          </div>
        )}

        {["pending_review", "approved"].includes(job.status) && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Internal notes (optional)</label>
            <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Any notes about this import…" rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:border-indigo-400" />
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {["pending_review", "approved"].includes(job.status) && (
            <>
              <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
                {approveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Approve & Import
              </button>
              {!showReject
                ? <button onClick={() => setShowReject(true)} className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-5 py-2.5 rounded-lg"><XCircle className="w-4 h-4" />Reject</button>
                : (
                  <div className="flex gap-2 items-center">
                    <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection…" className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-red-400 w-64" />
                    <button onClick={() => rejectMut.mutate()} disabled={!rejectReason || rejectMut.isPending} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">{rejectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reject"}</button>
                    <button onClick={() => setShowReject(false)} className="text-slate-400 hover:text-slate-700 text-sm">Cancel</button>
                  </div>
                )
              }
            </>
          )}
          {job.status === "completed" && (
            <button onClick={() => rollbackMut.mutate(job.id)} disabled={rollbackMut.isPending}
              className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium px-5 py-2.5 rounded-lg">
              {rollbackMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Emergency Rollback
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Data Transfer Queue</h2>
        <p className="text-sm text-slate-500 mt-0.5">Concierge transfer requests pending review</p>
      </div>
      {isLoading && <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 className="w-5 h-5 animate-spin" /> Loading queue…</div>}
      {!isLoading && jobs.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No transfer jobs in the queue.</p>
        </div>
      )}
      <div className="space-y-2">
        {jobs.map(j => (
          <button key={j.id} onClick={() => setSelectedId(j.id)}
            className="w-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-xl p-4 flex items-center gap-4 text-left transition">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-slate-800 text-sm">{j.store_name || `Store #${j.store_id}`}</span>
                <StatusPill status={j.status} />
                <span className="text-xs text-slate-400 capitalize">{j.source_platform}</span>
              </div>
              <p className="text-xs text-slate-400 truncate">{j.user_email} — {j.user_name}</p>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {(j.files_json ?? []).map(f => { const Icon = DATA_ICONS[f.type] ?? Users; return <span key={f.type} className="inline-flex items-center gap-1 text-xs text-slate-500"><Icon className="w-3 h-3 text-indigo-400" />{f.rows}</span>; })}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-400">{format(new Date(j.created_at), "MMM d, h:mm a")}</p>
              <ChevronRight className="w-4 h-4 text-slate-400 ml-auto mt-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
