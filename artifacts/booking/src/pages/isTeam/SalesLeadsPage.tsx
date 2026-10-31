/**
 * /isTeam/sales-leads — callers to Tom, Certxa's AI sales line (888) 814-7623 (owner, 2026-10-31).
 * Leads Tom saved during calls (GET /api/support/sales-leads) and every call with its summary.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";

type Lead = {
  id: number; name: string | null; business_name: string | null; phone: string | null; email: string | null;
  business_type: string | null; team_size: string | null; city: string | null; current_software: string | null;
  interested_plan: string | null; notes: string | null; trial_link_sent_at: string | null; status: string;
  created_at: string; summary: string | null; duration_seconds: number | null;
};
type Call = {
  id: number; caller_phone: string | null; outcome: string; duration_seconds: number | null; summary: string | null;
  lead_id: number | null; started_at: string; ended_at: string | null;
  fact_check_ok: boolean | null; fact_check_issues: string[] | null;
};
type SalesData = { leads: Lead[]; calls: Call[]; phoneNumber: string };

const STATUSES: [string, string][] = [["new", "New"], ["contacted", "Contacted"], ["signed_up", "Signed up"], ["not_interested", "Not interested"]];
const OUTCOMES: Record<string, string> = {
  trial_link_sent: "Trial link texted", lead_saved: "Lead saved", caller_hung_up: "Caller hung up", ended_by_tom: "Ended",
  silence: "Silent line", max_duration: "Time limit", in_progress: "In progress", ai_closed: "Ended", ai_error: "AI error", ai_timeout: "AI did not start",
};

const phone = (p: string | null) => (p && /^\d{10}$/.test(p) ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p ?? "—");
const mins = (s: number | null) => (s == null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

async function get(): Promise<SalesData> {
  const r = await fetch("/api/support/sales-leads", { credentials: "include" });
  if (!r.ok) throw new Error("Could not load sales leads");
  return r.json();
}

export default function SalesLeadsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery<SalesData>({ queryKey: ["support-sales-leads"], queryFn: get, refetchInterval: 30_000 });
  const [openCall, setOpenCall] = useState<number | null>(null);
  const { data: callDetail } = useQuery<any>({
    queryKey: ["support-sales-call", openCall],
    queryFn: () => fetch(`/api/support/sales-calls/${openCall}`, { credentials: "include" }).then((r) => r.json()),
    enabled: openCall != null,
  });

  const setStatus = async (id: number, status: string) => {
    await fetch(`/api/support/sales-leads/${id}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    void qc.invalidateQueries({ queryKey: ["support-sales-leads"] });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sales Leads</h1>
            <p className="text-sm text-slate-500 mt-0.5">Callers to Tom, the AI sales line{data ? ` at ${data.phoneNumber}` : ""}.</p>
          </div>
          <button onClick={() => refetch()} className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition bg-white" aria-label="Refresh">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {isLoading && <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>}
        {error && <div className="text-sm text-red-600">Could not load sales leads.</div>}

        {data && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Leads ({data.leads.length})</h3>
              </div>
              {data.leads.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">No leads yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-4 py-2 font-medium">Caller</th>
                        <th className="px-4 py-2 font-medium">Salon</th>
                        <th className="px-4 py-2 font-medium">Contact</th>
                        <th className="px-4 py-2 font-medium">Uses today</th>
                        <th className="px-4 py-2 font-medium">Trial link</th>
                        <th className="px-4 py-2 font-medium">Notes</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leads.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-800">{l.name || "—"}</div>
                            <div className="text-slate-400">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</div>
                          </td>
                          <td className="px-4 py-2 text-slate-700">
                            <div>{l.business_name || "—"}</div>
                            <div className="text-slate-400">{[l.business_type, l.team_size && `${l.team_size} staff`, l.city].filter(Boolean).join(" · ")}</div>
                            {l.interested_plan && <div className="text-slate-400">Interested in {l.interested_plan}</div>}
                          </td>
                          <td className="px-4 py-2 text-slate-700">
                            <div>{phone(l.phone)}</div>
                            <div className="text-slate-400">{l.email || ""}</div>
                          </td>
                          <td className="px-4 py-2 text-slate-700">{l.current_software || "—"}</td>
                          <td className="px-4 py-2 text-slate-700">{l.trial_link_sent_at ? format(new Date(l.trial_link_sent_at), "MMM d, h:mm a") : "—"}</td>
                          <td className="px-4 py-2 text-slate-600 max-w-xs">{l.summary || l.notes || "—"}</td>
                          <td className="px-4 py-2">
                            <select value={l.status} onChange={(e) => void setStatus(l.id, e.target.value)}
                              className="border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700">
                              {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Calls ({data.calls.length})</h3>
              </div>
              {data.calls.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">No calls yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-4 py-2 font-medium">When</th>
                        <th className="px-4 py-2 font-medium">Caller</th>
                        <th className="px-4 py-2 font-medium">Length</th>
                        <th className="px-4 py-2 font-medium">Result</th>
                        <th className="px-4 py-2 font-medium">Fact check</th>
                        <th className="px-4 py-2 font-medium">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.calls.map((c) => (
                        <tr key={c.id} className="border-t border-slate-100 align-top hover:bg-slate-50 cursor-pointer" onClick={() => setOpenCall(openCall === c.id ? null : c.id)}>
                          <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{format(new Date(c.started_at), "MMM d, h:mm a")}</td>
                          <td className="px-4 py-2 text-slate-700">{phone(c.caller_phone)}</td>
                          <td className="px-4 py-2 text-slate-700">{mins(c.duration_seconds)}</td>
                          <td className="px-4 py-2 text-slate-700">{OUTCOMES[c.outcome] ?? c.outcome}</td>
                          <td className="px-4 py-2">
                            {c.fact_check_ok == null ? <span className="text-slate-400">—</span>
                              : c.fact_check_ok ? <span className="text-slate-600">Passed</span>
                              : <span className="font-medium text-red-700">{(c.fact_check_issues ?? []).length} to review</span>}
                            {c.fact_check_ok === false && openCall === c.id && (
                              <ul className="mt-1 list-disc pl-4 text-red-700">{(c.fact_check_issues ?? []).map((i, n) => <li key={n}>{i}</li>)}</ul>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-600">
                            {c.summary || "—"}
                            {openCall === c.id && Array.isArray(callDetail?.transcript) && (
                              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                {callDetail.transcript.map((t: any, i: number) => (
                                  <p key={i}><span className="font-medium text-slate-700">{t.role === "tom" ? "Tom" : "Caller"}:</span> {t.text}</p>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
