import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AiReceptionistData, type AiCallRecord } from "@/lib/api";
import {
  Bot, Phone, Calendar, DollarSign, Clock, CheckCircle2,
  AlertCircle, RefreshCw, Zap, TrendingUp, Wifi, WifiOff,
  ChevronDown, ChevronUp, PhoneCall, PhoneMissed, PhoneOff,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { clsx } from "clsx";

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return "—"; }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy h:mm a"); } catch { return "—"; }
}

function OutcomeIcon({ outcome }: { outcome: string }) {
  if (outcome === "booked")      return <CheckCircle2 size={13} className="text-emerald-500" />;
  if (outcome === "in_progress") return <PhoneCall    size={13} className="text-blue-500" />;
  if (outcome === "no_answer" || outcome === "missed") return <PhoneMissed size={13} className="text-amber-500" />;
  if (outcome === "error")       return <AlertCircle  size={13} className="text-rose-500" />;
  return <PhoneOff size={13} className="text-slate-400" />;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, string> = {
    booked:      "bg-emerald-50 text-emerald-700 border-emerald-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    no_answer:   "bg-amber-50 text-amber-700 border-amber-200",
    missed:      "bg-amber-50 text-amber-700 border-amber-200",
    completed:   "bg-slate-50 text-slate-600 border-slate-200",
    error:       "bg-rose-50 text-rose-700 border-rose-200",
  };
  const label = outcome.replace(/_/g, " ");
  return (
    <span className={clsx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold capitalize", map[outcome] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
      <OutcomeIcon outcome={outcome} />
      {label}
    </span>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3 items-start">
      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold text-slate-800 leading-tight">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function CallRow({ call }: { call: AiCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
          {fmtDateTime(call.startedAt)}
        </td>
        <td className="px-4 py-2.5">
          <div className="text-xs font-medium text-slate-800">{call.callerPhone ?? "Unknown"}</div>
          {call.callerName && <div className="text-[10px] text-slate-400">{call.callerName}</div>}
        </td>
        <td className="px-4 py-2.5"><OutcomeBadge outcome={call.outcome} /></td>
        <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums">{fmtDuration(call.durationSeconds)}</td>
        <td className="px-4 py-2.5 text-xs tabular-nums">
          {call.totalCost != null ? (
            <span className="text-slate-800 font-medium">${call.totalCost.toFixed(4)}</span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-slate-400">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-slate-400 mb-0.5">Call SID</div>
                <div className="font-mono text-slate-600 break-all text-[10px]">{call.callSid ?? "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 mb-0.5">Twilio cost</div>
                <div className="text-slate-700">{call.twilioCost != null ? `$${call.twilioCost.toFixed(4)}` : "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 mb-0.5">OpenAI cost</div>
                <div className="text-slate-700">{call.openaiCost != null ? `$${call.openaiCost.toFixed(4)}` : "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 mb-0.5">AI responses</div>
                <div className="text-slate-700">{call.toolCallCount ?? "—"}</div>
              </div>
              {call.terminationReason && (
                <div className="col-span-2">
                  <div className="text-slate-400 mb-0.5">Termination reason</div>
                  <div className="text-slate-700 capitalize">{call.terminationReason.replace(/_/g, " ")}</div>
                </div>
              )}
              {call.appointmentId && (
                <div>
                  <div className="text-slate-400 mb-0.5">Appointment #</div>
                  <div className="text-emerald-700 font-medium">{call.appointmentId}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AIReceptionistTab({ accountId }: { accountId: number }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "booked" | "missed" | "error">("all");

  const { data, isLoading, error } = useQuery<AiReceptionistData>({
    queryKey: ["ai-receptionist", accountId],
    queryFn: () => api.accounts.aiReceptionist(accountId),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const provision = useMutation({
    mutationFn: () => api.accounts.aiReceptionistProvision(accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-receptionist", accountId] }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-48 text-sm text-slate-400">
      Failed to load AI Receptionist data
    </div>
  );

  const bookingRate = data.totalCalls > 0
    ? Math.round((data.bookedCalls / data.totalCalls) * 100)
    : 0;

  const filteredCalls = data.calls.filter(c => {
    if (filter === "booked")  return c.outcome === "booked";
    if (filter === "missed")  return c.outcome === "no_answer" || c.outcome === "missed";
    if (filter === "error")   return c.outcome === "error";
    return true;
  });

  return (
    <div className="space-y-5">

      {/* ── Account header ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">AI Receptionist</div>
              <div className="flex items-center gap-2 mt-0.5">
                {data.enabled ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <Wifi size={10} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                    <WifiOff size={10} /> Inactive
                  </span>
                )}
                {data.setupDate && (
                  <span className="text-[10px] text-slate-400">Set up {fmtDate(data.setupDate)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Provision button */}
          <button
            onClick={() => provision.mutate()}
            disabled={provision.isPending || !data.phoneNumber}
            title={!data.phoneNumber ? "No phone number provisioned yet" : "Re-apply Twilio webhook for this number"}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition border",
              data.phoneNumber
                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            )}
          >
            {provision.isPending ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Zap size={13} />
            )}
            Provision Webhook
          </button>
        </div>

        {provision.isSuccess && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={13} />
            Webhook applied — Twilio will now route calls to this account's AI Receptionist.
          </div>
        )}
        {provision.isError && (
          <div className="mt-3 flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} />
            {(provision.error as Error)?.message ?? "Provision failed"}
          </div>
        )}

        {/* Phone + webhook details */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
            <div className="text-[10px] text-slate-400 font-medium mb-0.5">Twilio Phone Number</div>
            <div className="flex items-center gap-2">
              <Phone size={13} className="text-slate-500" />
              <span className="text-sm font-mono font-medium text-slate-800">
                {data.phoneNumber ?? <span className="text-slate-400 font-sans font-normal text-xs">Not provisioned</span>}
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
            <div className="text-[10px] text-slate-400 font-medium mb-0.5">Webhook URL</div>
            <div className="text-xs font-mono text-slate-600 truncate">
              {data.webhookUrl ?? <span className="text-slate-400 font-sans">—</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Calendar size={16} />}    label="Months Active"   value={data.monthsActive || "—"} />
        <StatCard icon={<PhoneCall size={16} />}   label="Total Calls"     value={data.totalCalls} />
        <StatCard icon={<CheckCircle2 size={16} />} label="Bookings Made"  value={data.bookedCalls} sub={`${bookingRate}% rate`} />
        <StatCard icon={<Clock size={16} />}        label="Total Minutes"  value={data.totalMinutes} />
        <StatCard icon={<DollarSign size={16} />}   label="Total Spent"    value={`$${data.totalSpent.toFixed(2)}`} />
        <StatCard icon={<TrendingUp size={16} />}   label="This Period"    value={`$${data.periodSpent.toFixed(2)}`} />
      </div>

      {/* Booking rate bar */}
      {data.totalCalls > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">Booking Conversion Rate</span>
            <span className="text-xs font-bold text-slate-800">{bookingRate}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
              style={{ width: `${bookingRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
            <span>{data.bookedCalls} booked</span>
            <span>{data.totalCalls} total calls</span>
          </div>
        </div>
      )}

      {/* ── Call History ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-800">Call History</h3>
          <div className="flex items-center gap-1.5">
            {(["all", "booked", "missed", "error"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition border",
                  filter === f
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                )}
              >
                {f === "all" ? `All (${data.calls.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredCalls.length === 0 ? (
          <div className="py-16 text-center">
            <Bot size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No calls to display</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date & Time</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Caller</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Outcome</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Charge</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCalls.map(call => (
                  <CallRow key={call.id} call={call} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredCalls.length > 0 && (
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">{filteredCalls.length} call{filteredCalls.length !== 1 ? "s" : ""}</span>
            <span className="text-[10px] text-slate-500 font-medium">
              Total: ${filteredCalls.reduce((s, c) => s + (c.totalCost ?? 0), 0).toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
