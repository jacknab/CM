import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, Clock, CheckCircle2, AlertTriangle, XCircle, FileText } from "lucide-react";
import { supportApi } from "@/lib/support-api";
import HealthCheckSegmentCard, { type SegmentResult } from "@/components/isTeam/customer360/HealthCheckSegmentCard";

const SEGMENT_ORDER = [
  "booking_readiness",
  "team_roster",
  "services_catalog",
  "features_settings",
  "commission_payroll",
  "sms_communications",
  "payments_billing",
  "ai_receptionist",
  "online_presence",
  "kiosk_waitlist",
];

interface HealthRun {
  id: number;
  accountId: number;
  agentId: number;
  agentName: string;
  runAt: string;
  segmentsRun: string[];
  results: Record<string, SegmentResult>;
  passCount: number;
  warnCount: number;
  failCount: number;
  notes?: string | null;
}

interface HistoryItem {
  id: number;
  agentName: string;
  runAt: string;
  passCount: number;
  warnCount: number;
  failCount: number;
  notes?: string | null;
}

export default function HealthCheckTab({ accountId }: { accountId: number }) {
  const qc = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data: latestRun, isLoading: loadingLatest } = useQuery<HealthRun>({
    queryKey: ["health-check-latest", accountId],
    queryFn: () => supportApi.accounts.healthCheck.latest(accountId),
    staleTime: 0,
    retry: false,
  });

  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ["health-check-history", accountId],
    queryFn: () => supportApi.accounts.healthCheck.history(accountId),
    staleTime: 30_000,
    enabled: showHistory,
  });

  const { data: specificRun, isLoading: loadingSpecific } = useQuery<HealthRun>({
    queryKey: ["health-check-run", accountId, activeRunId],
    queryFn: () => supportApi.accounts.healthCheck.get(accountId, activeRunId!),
    enabled: !!activeRunId,
    staleTime: 0,
  });

  const activeRun: HealthRun | undefined = activeRunId ? specificRun : latestRun;
  const isLoading = activeRunId ? loadingSpecific : loadingLatest;

  const runAll = useMutation({
    mutationFn: () => supportApi.accounts.healthCheck.run(accountId),
    onSuccess: (data: HealthRun) => {
      setActiveRunId(null);
      qc.setQueryData(["health-check-latest", accountId], data);
      qc.invalidateQueries({ queryKey: ["health-check-history", accountId] });
    },
  });

  const rerunSegment = async (segmentId: string) => {
    if (!activeRun?.id) {
      await runAll.mutateAsync();
      return;
    }
    const result = await supportApi.accounts.healthCheck.rerunSegment(accountId, activeRun.id, segmentId);
    const updated: HealthRun = {
      ...activeRun,
      results: { ...activeRun.results, [segmentId]: result },
    };
    if (activeRunId) {
      qc.setQueryData(["health-check-run", accountId, activeRunId], updated);
    } else {
      qc.setQueryData(["health-check-latest", accountId], updated);
    }
    qc.invalidateQueries({ queryKey: ["health-check-history", accountId] });
  };

  const saveNote = async () => {
    if (!activeRun?.id) return;
    setSavingNote(true);
    try {
      await supportApi.accounts.healthCheck.updateNotes(accountId, activeRun.id, note);
      qc.invalidateQueries({ queryKey: ["health-check-latest", accountId] });
      qc.invalidateQueries({ queryKey: ["health-check-run", accountId, activeRun.id] });
    } finally {
      setSavingNote(false);
    }
  };

  const orderedSegments: SegmentResult[] = activeRun
    ? SEGMENT_ORDER.map(id => activeRun.results[id]).filter(Boolean)
    : [];

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-slate-800">Account Diagnostics</h2>
          {activeRun && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last run: {new Date(activeRun.runAt).toLocaleString()} by {activeRun.agentName}
              {activeRunId && <span className="ml-1 text-indigo-500">(viewing historical run #{activeRunId})</span>}
            </p>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
          >
            <Clock size={13} />
            History
            <ChevronDown size={11} />
          </button>
          {showHistory && history && history.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Recent Runs
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {history.map(h => (
                  <button
                    key={h.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition"
                    onClick={() => { setActiveRunId(h.id); setShowHistory(false); }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">#{h.id} — {h.agentName}</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        {h.failCount > 0 && <span className="text-red-500">{h.failCount}✗</span>}
                        {h.warnCount > 0 && <span className="text-amber-500">{h.warnCount}⚠</span>}
                        <span className="text-emerald-500">{h.passCount}✓</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{new Date(h.runAt).toLocaleString()}</div>
                    {h.notes && <div className="text-[11px] text-slate-500 mt-0.5 truncate italic">{h.notes}</div>}
                  </button>
                ))}
              </div>
              {activeRunId && (
                <div className="border-t border-slate-100 px-3 py-2">
                  <button
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() => { setActiveRunId(null); setShowHistory(false); }}
                  >
                    ← Back to latest run
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => runAll.mutate()}
          disabled={runAll.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition disabled:opacity-60"
        >
          <RefreshCw size={13} className={runAll.isPending ? "animate-spin" : ""} />
          {runAll.isPending ? "Running…" : "Run All"}
        </button>
      </div>

      {activeRun && (
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            <span className="text-sm font-bold text-red-600">{activeRun.failCount}</span>
            <span className="text-xs text-slate-400">Fail</span>
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <span className="text-sm font-bold text-amber-600">{activeRun.warnCount}</span>
            <span className="text-xs text-slate-400">Warn</span>
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="text-sm font-bold text-emerald-600">{activeRun.passCount}</span>
            <span className="text-xs text-slate-400">Pass</span>
          </div>
          <div className="flex-1" />
          <span className="text-[10px] text-slate-400">Run #{activeRun.id}</span>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && !activeRun && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
            <CheckCircle2 size={22} className="text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 mb-1">No diagnostics run yet</p>
          <p className="text-xs text-slate-400 mb-4">Click "Run All" to run a full account diagnostic.</p>
          <button
            onClick={() => runAll.mutate()}
            disabled={runAll.isPending}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
          >
            <RefreshCw size={14} className={runAll.isPending ? "animate-spin" : ""} />
            {runAll.isPending ? "Running diagnostics…" : "Run Diagnostics"}
          </button>
        </div>
      )}

      {!isLoading && activeRun && (
        <div className="space-y-3">
          {orderedSegments.map(seg => (
            <HealthCheckSegmentCard
              key={seg.segmentId}
              segment={seg}
              runId={activeRun.id}
              accountId={accountId}
              onRerun={rerunSegment}
            />
          ))}
        </div>
      )}

      {activeRun && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Agent Notes</span>
          </div>
          <textarea
            className="w-full text-xs border border-slate-200 rounded-lg p-2.5 resize-none text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            rows={3}
            placeholder="Add notes about this run — e.g. 'Fixed timezone issue, re-ran booking readiness — all green.'"
            defaultValue={activeRun.notes ?? ""}
            onChange={e => setNote(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              onClick={saveNote}
              disabled={savingNote || !note}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {savingNote ? "Saving…" : "Save Note"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

