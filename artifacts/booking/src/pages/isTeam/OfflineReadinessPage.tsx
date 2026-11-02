import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { supportApi } from "@/lib/support-api";
import { OfflineProblems, OfflineScore } from "@/components/isTeam/OfflineHealthSummary";

/**
 * Offline readiness: every salon whose tablets report their offline-mode health, worst first (owner, 2026-11-02;
 * phase 2). The score and problems are worked out every 5 minutes on the server (lib/offlineHealthRules.ts); open a
 * salon for its tablets (Devices tab).
 */
export default function OfflineReadinessPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["support-offline-health-list"], queryFn: () => supportApi.offlineHealth(), refetchInterval: 60_000 });
  const salons = data?.salons ?? [];
  const broken = salons.filter((s) => s.score != null && s.score < 60).length;
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Offline readiness</h1>
        <p className="text-sm text-slate-500">
          Each salon's offline mode (offline database, salon copy, hub), from its tablets' reports. Worst first; updated every 5 minutes.
          {salons.length > 0 && ` ${salons.length} salon${salons.length === 1 ? "" : "s"}, ${broken} below 60.`}
        </p>
      </div>
      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">Could not load offline readiness.</p>}
      {!isLoading && !error && salons.length === 0 && <p className="text-sm text-slate-400">No salon's tablets have reported yet.</p>}
      <div className="space-y-3">
        {salons.map((s) => (
          <div key={s.storeId} className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`offline-readiness-${s.storeId}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Link to={`/isTeam/accounts/${s.storeId}`} className="font-medium text-slate-900 hover:underline">{s.name}</Link>
                <span className="text-xs text-slate-400">#{s.storeId}</span>
                <OfflineScore score={s.score} />
              </div>
              <span className="text-xs text-slate-400">
                {s.devices} tablet{s.devices === 1 ? "" : "s"}{s.lastReportAt ? ` · last report ${formatDistanceToNowStrict(new Date(s.lastReportAt))} ago` : ""}
              </span>
            </div>
            <OfflineProblems problems={s.problems} limit={4} />
          </div>
        ))}
      </div>
    </div>
  );
}
