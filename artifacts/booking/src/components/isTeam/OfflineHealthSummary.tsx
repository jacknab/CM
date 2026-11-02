import type { OfflineFix, OfflineHealthProblem } from "@/lib/support-api";

/** The offline-mode score as a coloured pill: 90+ healthy, 60+ needs attention, below that broken; null = no reports. */
export function OfflineScore({ score }: { score: number | null }) {
  const tone = score == null ? "bg-slate-100 text-slate-500" : score >= 90 ? "bg-emerald-50 text-emerald-700" : score >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{score == null ? "No reports" : `${score} / 100`}</span>;
}

const SEVERITY: Record<OfflineHealthProblem["severity"], { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "text-red-700 bg-red-50" },
  warning: { label: "Warning", cls: "text-amber-700 bg-amber-50" },
  info: { label: "Note", cls: "text-slate-600 bg-slate-100" },
};

/** The problems the offline-health rules found, worst first, each with whether it can be fixed automatically. */
export function OfflineProblems({ problems, limit, onFix, fixing }: {
  problems: OfflineHealthProblem[];
  limit?: number;
  /** Run fix (the account's Devices tab). */
  onFix?: (p: OfflineHealthProblem) => void;
  /** The problem whose fix is being started. */
  fixing?: string | null;
}) {
  if (!problems.length) return <p className="text-xs text-emerald-700">No problems found.</p>;
  const shown = limit ? problems.slice(0, limit) : problems;
  return (
    <ul className="space-y-1.5">
      {shown.map((p, i) => (
        <li key={`${p.code}-${p.deviceId ?? ""}-${i}`} className="flex items-start gap-2 text-xs text-slate-700">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY[p.severity].cls}`}>{SEVERITY[p.severity].label}</span>
          <span className="flex-1">
            {p.text}
            {p.needsPerson ? <span className="text-red-600 font-medium"> · needs a person: the automatic fix failed 3 times today</span>
              : p.fix ? <span className="text-slate-400"> · fixed automatically</span> : null}
          </span>
          {onFix && p.fix && (
            <button type="button" onClick={() => onFix(p)} disabled={fixing === `${p.fix}:${p.deviceId ?? ""}`}
              className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {fixing === `${p.fix}:${p.deviceId ?? ""}` ? "Starting…" : "Run fix"}
            </button>
          )}
        </li>
      ))}
      {limit && problems.length > limit && <li className="text-xs text-slate-400">+{problems.length - limit} more</li>}
    </ul>
  );
}

const FIX_NAMES: Record<string, string> = {
  elect_hub: "Choose the hub again", refresh_hub: "Refresh the hub link", retry_unsent: "Send waiting changes",
  resync_mirror: "Re-sync the salon copy", reload_page: "Reload the page", reopen_database: "Reopen the offline database",
  restart_app: "Restart the app", apply_update: "Install the app update", test_printer: "Test the printer",
};
export const fixName = (command: string) => FIX_NAMES[command] ?? command;

/** The salon's recent fixes: what, on which tablet, by whom, and how it went. */
export function OfflineFixHistory({ fixes }: { fixes: OfflineFix[] }) {
  if (!fixes.length) return null;
  const tone = (s: string) => (s === "done" ? "text-emerald-700" : s === "failed" || s === "expired" ? "text-red-600" : "text-amber-700");
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Recent fixes</p>
      <ul className="space-y-1">
        {fixes.slice(0, 10).map((f) => (
          <li key={f.id} className="text-xs text-slate-600">
            <span className="font-medium text-slate-700">{fixName(f.command)}</span>
            {f.deviceId && <span className="font-mono text-slate-400"> · {f.deviceId.slice(0, 14)}</span>}
            <span className={tone(f.status)}> · {f.status}</span>
            {f.detail && <span className="text-slate-500"> · {f.detail}</span>}
            <span className="text-slate-400"> · {f.createdBy === "auto" ? "automatic" : f.createdBy.replace(/^support:/, "")} · {new Date(f.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
