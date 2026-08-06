import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  action?: string;
}

export interface SegmentResult {
  segmentId: string;
  label: string;
  status: CheckStatus;
  runAt: string;
  checks: CheckResult[];
  tables?: Record<string, unknown[]>;
}

interface Props {
  segment: SegmentResult;
  runId?: number;
  accountId: number;
  onRerun?: (segmentId: string) => Promise<void>;
  defaultExpanded?: boolean;
}

function StatusIcon({ status, size = 16 }: { status: CheckStatus; size?: number }) {
  if (status === "pass") return <CheckCircle2 size={size} className="text-emerald-500 flex-shrink-0" />;
  if (status === "warn") return <AlertTriangle size={size} className="text-amber-500 flex-shrink-0" />;
  return <XCircle size={size} className="text-red-500 flex-shrink-0" />;
}

function StatusPill({ status }: { status: CheckStatus }) {
  const map = {
    pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50  text-amber-700  border-amber-200",
    fail: "bg-red-50    text-red-700    border-red-200",
  };
  const labels = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  return (
    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full tracking-wide ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function StaffAvailabilityTable({ rows }: { rows: Record<string, unknown>[] }) {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return (
    <div className="overflow-x-auto mt-2">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-3 py-1.5 font-medium text-slate-600 border border-slate-200 min-w-[120px]">Staff</th>
            {dayLabels.map((d, i) => (
              <th key={i} className="px-2 py-1.5 font-medium text-slate-600 border border-slate-200 text-center">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
              <td className="px-3 py-1.5 border border-slate-200 font-medium text-slate-700">{r.staffName}</td>
              {days.map(d => (
                <td key={d} className="px-2 py-1.5 border border-slate-200 text-center">
                  {r[d]
                    ? <span className="text-emerald-500">✓</span>
                    : <span className="text-slate-300">✗</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffServicesTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="mt-2 space-y-1">
      {(rows as any[]).map((r, i) => (
        <div key={i} className="text-xs flex gap-2 flex-wrap items-start">
          <span className="font-medium text-slate-700 min-w-[110px]">{r.staffName}</span>
          {r.missing?.length > 0 && (
            <span className="text-red-600">Missing: {(r.missing as string[]).join(", ")}</span>
          )}
          {(!r.missing || r.missing.length === 0) && (
            <span className="text-emerald-600">All services assigned</span>
          )}
        </div>
      ))}
    </div>
  );
}

function GenericTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto mt-2">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr className="bg-slate-50">
            {keys.map(k => (
              <th key={k} className="text-left px-2 py-1.5 font-medium text-slate-600 border border-slate-200 capitalize whitespace-nowrap">
                {k.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
              {keys.map(k => (
                <td key={k} className="px-2 py-1.5 border border-slate-200 text-slate-700 max-w-[200px] truncate">
                  {r[k] === null || r[k] === undefined
                    ? <span className="text-slate-300">—</span>
                    : typeof r[k] === "boolean"
                    ? (r[k] ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">✗</span>)
                    : Array.isArray(r[k])
                    ? (r[k] as unknown[]).join(", ")
                    : String(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HealthCheckSegmentCard({ segment, runId, accountId, onRerun, defaultExpanded }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? segment.status !== "pass");
  const [rerunning, setRerunning] = useState(false);

  const headerColor = {
    pass: "border-l-emerald-400",
    warn: "border-l-amber-400",
    fail: "border-l-red-500",
  }[segment.status];

  const handleRerun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRerun) return;
    setRerunning(true);
    try { await onRerun(segment.segmentId); } finally { setRerunning(false); }
  };

  const passCount = segment.checks.filter(c => c.status === "pass").length;
  const warnCount = segment.checks.filter(c => c.status === "warn").length;
  const failCount = segment.checks.filter(c => c.status === "fail").length;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${headerColor} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-slate-50 transition"
        onClick={() => setExpanded(e => !e)}
      >
        <StatusIcon status={segment.status} size={18} />
        <StatusPill status={segment.status} />
        <span className="font-semibold text-slate-800 text-sm flex-1">{segment.label}</span>

        {/* Tally */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 mr-2">
          {failCount > 0 && <span className="text-red-500 font-medium">{failCount} ✗</span>}
          {warnCount > 0 && <span className="text-amber-500 font-medium">{warnCount} ⚠</span>}
          {passCount > 0 && <span className="text-emerald-500 font-medium">{passCount} ✓</span>}
        </div>

        {onRerun && (
          <button
            onClick={handleRerun}
            disabled={rerunning}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-lg transition disabled:opacity-50 mr-1"
          >
            <RefreshCw size={11} className={rerunning ? "animate-spin" : ""} />
            Re-run
          </button>
        )}

        {expanded ? <ChevronDown size={15} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-slate-400 flex-shrink-0" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {rerunning && (
            <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-600 text-xs">
              <RefreshCw size={13} className="animate-spin" />
              Re-running segment…
            </div>
          )}

          {segment.checks.map(check => (
            <div key={check.id} className="px-4 py-2.5 flex items-start gap-3">
              <StatusIcon status={check.status} size={14} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-700">{check.label}</span>
                </div>
                {check.detail && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{check.detail}</p>
                )}
                {check.action && (
                  <div className="flex items-center gap-1 mt-1">
                    <ArrowRight size={10} className="text-indigo-400 flex-shrink-0" />
                    <span className="text-[11px] text-indigo-600 font-medium">{check.action}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Tables */}
          {segment.tables && Object.entries(segment.tables).map(([key, rows]) => {
            if (!Array.isArray(rows) || rows.length === 0) return null;
            const tableRows = rows as Record<string, unknown>[];
            return (
              <div key={key} className="px-4 py-3 bg-slate-50/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  {key.replace(/_/g, " ")}
                </p>
                {key === "staff_availability" && <StaffAvailabilityTable rows={tableRows} />}
                {key === "staff_services"    && <StaffServicesTable rows={tableRows} />}
                {key !== "staff_availability" && key !== "staff_services" && <GenericTable rows={tableRows} />}
              </div>
            );
          })}

          {/* Run timestamp */}
          <div className="px-4 py-2 text-[10px] text-slate-300">
            Run at {new Date(segment.runAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
