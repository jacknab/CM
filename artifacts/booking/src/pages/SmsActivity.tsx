import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import {
  MessageSquare, TrendingUp, Wallet, DollarSign,
  ChevronDown, ChevronUp, Loader2, Filter, CreditCard, AlertTriangle, Zap, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

// ── helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    booking_confirmation: "Confirmation",
    confirmation: "Confirmation",
    reminder: "Reminder",
    review_request: "Review",
    review: "Review",
    marketing: "Marketing",
    system: "System",
    "sandbox-skipped": "Sandbox",
  };
  return map[t] ?? t;
}

function sourceBadge(src: string | null) {
  if (src === "allowance")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/25">
        Allowance
      </span>
    );
  if (src === "credits")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
        Credits
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-700/40 text-zinc-400 border border-zinc-700/40">
      —
    </span>
  );
}

function statusDot(status: string) {
  if (status === "sent") return "bg-emerald-400";
  if (status === "failed") return "bg-red-400";
  if (status === "sandbox-skipped") return "bg-zinc-500";
  return "bg-zinc-500";
}

// ── types ─────────────────────────────────────────────────────────────────────

interface SmsLogRow {
  id: number;
  storeId: number;
  phone: string;
  messageType: string;
  messageBody: string;
  status: string;
  smsSource: string | null;
  costEstimate: string | null;
  sentAt: string;
}

interface Summary {
  totalSent: number;
  fromAllowance: number;
  fromCredits: number;
  estimatedCost: number;
  estimatedRevenue: number;
  byType: Record<string, number>;
  days: number;
}

interface LogResponse {
  rows: SmsLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SmsBalance {
  smsAllowance: number;
  smsCredits: number;
  smsCreditsTotalPurchased: number;
  planMonthlyAllowance: number;
}

interface DailyBucket {
  date: string;
  sent: number;
  failed: number;
}

interface LocationGroup {
  storeId: number;
  storeName: string;
  totalSent: number;
  fromAllowance: number;
  fromCredits: number;
  estimatedCost: number;
}

const DAY_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const TYPE_OPTIONS = [
  { label: "All types", value: "" },
  { label: "Reminders", value: "reminder" },
  { label: "Confirmations", value: "booking_confirmation" },
  { label: "Reviews", value: "review_request" },
  { label: "Marketing", value: "marketing" },
  { label: "System", value: "system" },
];

const SOURCE_OPTIONS = [
  { label: "All sources", value: "" },
  { label: "Allowance", value: "allowance" },
  { label: "Credits", value: "credits" },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function SmsActivity() {
  const { selectedStore } = useSelectedStore();

  const [days, setDays] = useState(30);
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedLocations, setExpandedLocations] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "locations" | "credits">("table");

  const storeId = selectedStore?.id;

  const balanceQuery = useQuery<SmsBalance>({
    queryKey: ["sms-balance", storeId],
    queryFn: () => apiFetch(`/api/billing/sms-status/${storeId}`),
    enabled: !!storeId && viewMode === "credits",
  });

  const dailyQuery = useQuery<DailyBucket[]>({
    queryKey: ["sms-daily", storeId, days],
    queryFn: () => apiFetch(`/api/sms-activity/daily?days=${days}`),
    enabled: !!storeId && viewMode === "credits",
  });

  const summaryQuery = useQuery<Summary>({
    queryKey: ["sms-activity-summary", storeId, days],
    queryFn: () => apiFetch(`/api/sms-activity/summary?storeId=${storeId}&days=${days}`),
    enabled: !!storeId,
  });

  const logQuery = useQuery<LogResponse>({
    queryKey: ["sms-activity-log", storeId, days, typeFilter, sourceFilter, page],
    queryFn: () =>
      apiFetch(
        `/api/sms-activity/log?storeId=${storeId}&days=${days}&type=${typeFilter}&source=${sourceFilter}&page=${page}&pageSize=25`
      ),
    enabled: !!storeId,
  });

  const locationQuery = useQuery<LocationGroup[]>({
    queryKey: ["sms-activity-by-location", days],
    queryFn: () => apiFetch(`/api/sms-activity/by-location?days=${days}`),
    enabled: viewMode === "locations",
  });

  const summary = summaryQuery.data;

  const handleFilterChange = () => setPage(1);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-20">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">SMS Activity</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Full transparency ledger of all outbound SMS</p>
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([
              { key: "table", label: "Log" },
              { key: "credits", label: "Credits" },
              { key: "locations", label: "By Location" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === key
                    ? "bg-violet-600 text-white"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            {
              label: "Total Sent",
              value: summaryQuery.isLoading ? "—" : (summary?.totalSent ?? 0).toLocaleString(),
              icon: MessageSquare,
              iconColor: "text-violet-400",
              iconBg: "bg-violet-500/20",
              cardBg: "bg-violet-500/10 border-violet-500/30",
            },
            {
              label: "From Allowance",
              value: summaryQuery.isLoading ? "—" : (summary?.fromAllowance ?? 0).toLocaleString(),
              icon: TrendingUp,
              iconColor: "text-blue-400",
              iconBg: "bg-blue-500/20",
              cardBg: "bg-blue-500/10 border-blue-500/30",
            },
            {
              label: "From Credits",
              value: summaryQuery.isLoading ? "—" : (summary?.fromCredits ?? 0).toLocaleString(),
              icon: Wallet,
              iconColor: "text-emerald-400",
              iconBg: "bg-emerald-500/20",
              cardBg: "bg-emerald-500/10 border-emerald-500/30",
            },
            {
              label: "Est. Twilio Cost",
              value: summaryQuery.isLoading ? "—" : `$${(summary?.estimatedCost ?? 0).toFixed(2)}`,
              icon: DollarSign,
              iconColor: "text-amber-400",
              iconBg: "bg-amber-500/20",
              cardBg: "bg-amber-500/10 border-amber-500/30",
            },
            {
              label: "Est. Revenue Value",
              value: summaryQuery.isLoading ? "—" : `$${(summary?.estimatedRevenue ?? 0).toFixed(2)}`,
              icon: DollarSign,
              iconColor: "text-pink-400",
              iconBg: "bg-pink-500/20",
              cardBg: "bg-pink-500/10 border-pink-500/30",
            },
          ].map(({ label, value, icon: Icon, iconColor, iconBg, cardBg }) => (
            <div
              key={label}
              className={`rounded-xl border p-4 space-y-3 ${cardBg}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
              <div>
                <p className="text-foreground font-bold text-xl leading-none">{value}</p>
                <p className="text-muted-foreground text-[10px] mt-1.5 font-medium uppercase tracking-wider">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />

            {/* Date range */}
            <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
              {DAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setDays(opt.value); setPage(1); handleFilterChange(); }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === opt.value
                      ? "bg-violet-600 text-white"
                      : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Type */}
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="text-xs bg-muted border border-border text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Source */}
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="text-xs bg-muted border border-border text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <span className="text-muted-foreground text-xs ml-auto">
              {logQuery.data ? `${logQuery.data.total.toLocaleString()} records` : ""}
            </span>
          </CardContent>
        </Card>

        {/* ── Credits view ─────────────────────────────────────────────────── */}
        {viewMode === "credits" && (() => {
          const bal = balanceQuery.data;
          const daily = dailyQuery.data ?? [];
          const LOW_THRESHOLD = 20;
          const CRITICAL_THRESHOLD = 5;
          const totalBalance = (bal?.smsAllowance ?? 0) + (bal?.smsCredits ?? 0);
          const isLow = totalBalance <= LOW_THRESHOLD && totalBalance > CRITICAL_THRESHOLD;
          const isCritical = totalBalance <= CRITICAL_THRESHOLD;
          const allowancePct = bal && bal.planMonthlyAllowance > 0
            ? Math.min(100, Math.round((bal.smsAllowance / bal.planMonthlyAllowance) * 100))
            : null;

          // Daily chart — max bar height represents the peak day
          const maxSent = Math.max(...daily.map(d => d.sent), 1);

          // Message type breakdown from summary
          const byType = summary?.byType ?? {};
          const typeTotal = Object.values(byType).reduce((a, b) => a + b, 0);
          const TYPE_COLORS: Record<string, string> = {
            booking_confirmation: "bg-violet-500",
            confirmation: "bg-violet-500",
            reminder: "bg-blue-500",
            review_request: "bg-emerald-500",
            review: "bg-emerald-500",
            marketing: "bg-amber-500",
            system: "bg-zinc-500",
          };

          return (
            <div className="space-y-4">
              {/* Low/Critical balance banner */}
              {(isLow || isCritical) && (
                <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${isCritical ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${isCritical ? "text-red-400" : "text-amber-400"}`} />
                  <p className={`text-sm ${isCritical ? "text-red-300" : "text-amber-300"}`}>
                    {isCritical
                      ? `Your SMS balance is critically low (${totalBalance} remaining). Top up now to avoid disruptions.`
                      : `Your SMS balance is running low (${totalBalance} remaining). Consider topping up soon.`}
                  </p>
                  <a href="/settings/billing" className={`ml-auto text-xs font-semibold shrink-0 underline ${isCritical ? "text-red-300" : "text-amber-300"}`}>
                    Top up →
                  </a>
                </div>
              )}

              {/* Balance cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Plan allowance */}
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-violet-400" />
                    <p className="text-violet-300 text-xs font-semibold uppercase tracking-wider">Plan Allowance</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{(bal?.smsAllowance ?? 0).toLocaleString()}</p>
                  <p className="text-zinc-500 text-xs">of {(bal?.planMonthlyAllowance ?? 0).toLocaleString()} monthly credits</p>
                  {allowancePct != null && (
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${allowancePct}%` }} />
                    </div>
                  )}
                </div>

                {/* Purchased credits */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wider">Purchased Credits</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{(bal?.smsCredits ?? 0).toLocaleString()}</p>
                  <p className="text-zinc-500 text-xs">{(bal?.smsCreditsTotalPurchased ?? 0).toLocaleString()} total purchased all time</p>
                </div>

                {/* Total available */}
                <div className={`rounded-xl border p-4 space-y-3 ${isCritical ? "border-red-500/20 bg-red-500/10" : isLow ? "border-amber-500/20 bg-amber-500/10" : "border-zinc-700/50 bg-zinc-900/60"}`}>
                  <div className="flex items-center gap-2">
                    <Wallet className={`w-4 h-4 ${isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-zinc-400"}`} />
                    <p className={`text-xs font-semibold uppercase tracking-wider ${isCritical ? "text-red-300" : isLow ? "text-amber-300" : "text-zinc-400"}`}>Total Available</p>
                  </div>
                  <p className={`text-2xl font-bold ${isCritical ? "text-red-300" : isLow ? "text-amber-300" : "text-white"}`}>
                    {balanceQuery.isLoading ? "—" : totalBalance.toLocaleString()}
                  </p>
                  <p className="text-zinc-500 text-xs">credits remaining</p>
                </div>
              </div>

              {/* Daily trend chart */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="w-4 h-4 text-violet-400" />
                  <p className="text-foreground text-sm font-semibold">Daily SMS Volume</p>
                  <span className="text-muted-foreground text-xs ml-auto">last {days} days</span>
                </div>
                {dailyQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                  </div>
                ) : daily.length === 0 ? (
                  <p className="text-zinc-600 text-sm text-center py-8">No messages sent in this period</p>
                ) : (
                  <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
                    {daily.map((d) => {
                      const pct = (d.sent / maxSent) * 100;
                      const failPct = d.sent + d.failed > 0 ? (d.failed / (d.sent + d.failed)) * 100 : 0;
                      return (
                        <div key={d.date} className="flex flex-col items-center gap-1 flex-1 min-w-[14px] group relative">
                          <div className="w-full flex flex-col justify-end" style={{ height: "88px" }}>
                            <div
                              className="w-full rounded-t bg-violet-600 group-hover:bg-violet-500 transition-colors"
                              style={{ height: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                          {/* Tooltip on hover */}
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                            <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-lg">
                              {format(new Date(d.date + "T00:00:00"), "MMM d")} · {d.sent} sent{d.failed > 0 ? ` · ${d.failed} failed` : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Message type breakdown */}
              {typeTotal > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-foreground text-sm font-semibold mb-4">Messages by Type</p>
                  <div className="space-y-3">
                    {Object.entries(byType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, cnt]) => {
                        const pct = Math.round((cnt / typeTotal) * 100);
                        const color = TYPE_COLORS[type] ?? "bg-zinc-500";
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <p className="text-zinc-400 text-xs w-28 shrink-0">{typeLabel(type)}</p>
                            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-zinc-300 text-xs font-semibold w-8 text-right">{pct}%</span>
                              <span className="text-zinc-600 text-xs w-10 text-right">{cnt.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {/* Stacked bar */}
                  <div className="mt-4 w-full h-2 rounded-full overflow-hidden flex">
                    {Object.entries(byType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, cnt]) => {
                        const color = (TYPE_COLORS[type] ?? "bg-zinc-500").replace("bg-", "bg-");
                        return (
                          <div
                            key={type}
                            className={`h-full ${color}`}
                            style={{ width: `${Math.round((cnt / typeTotal) * 100)}%` }}
                          />
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Table view ───────────────────────────────────────────────────── */}
        {viewMode === "table" && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-0 pt-5 px-6">
              <CardTitle className="text-foreground text-sm font-semibold">SMS Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logQuery.isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : !logQuery.data?.rows.length ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No SMS records found for the selected filters.</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/60 text-left">
                          {["Time", "SMS Type", "Recipient", "Source", "Cost", "Status"].map(col => (
                            <th key={col} className="px-6 py-3 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {logQuery.data.rows.map((row) => (
                          <tr key={row.id} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-3.5 text-zinc-400 text-xs whitespace-nowrap">
                              {format(new Date(row.sentAt), "MMM d, h:mm a")}
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="text-zinc-300 text-xs font-medium">
                                {typeLabel(row.messageType)}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-zinc-400 text-xs font-mono">
                              {row.phone}
                            </td>
                            <td className="px-6 py-3.5">
                              {sourceBadge(row.smsSource)}
                            </td>
                            <td className="px-6 py-3.5 text-zinc-500 text-xs">
                              ${Number(row.costEstimate ?? 0).toFixed(4)}
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(row.status)}`} />
                                <span className="text-zinc-400 text-xs capitalize">
                                  {row.status === "sandbox-skipped" ? "Sandbox" : row.status}
                                </span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-zinc-800/40">
                    {logQuery.data.rows.map((row) => (
                      <div key={row.id} className="px-4 py-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300 text-sm font-medium">{typeLabel(row.messageType)}</span>
                          <span className="text-zinc-500 text-xs">{format(new Date(row.sentAt), "MMM d, h:mm a")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {sourceBadge(row.smsSource)}
                          <span className="text-zinc-500 text-xs font-mono">{row.phone}</span>
                          <span className="text-zinc-600 text-xs ml-auto">${Number(row.costEstimate ?? 0).toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {(logQuery.data.totalPages ?? 1) > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/50">
                      <span className="text-zinc-500 text-xs">
                        Page {logQuery.data.page} of {logQuery.data.totalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-zinc-700"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-zinc-700"
                          onClick={() => setPage(p => Math.min(logQuery.data!.totalPages, p + 1))}
                          disabled={page >= logQuery.data.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Location grouping view ────────────────────────────────────────── */}
        {viewMode === "locations" && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-0 pt-5 px-6">
              <CardTitle className="text-foreground text-sm font-semibold">SMS by Location</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {locationQuery.isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : !locationQuery.data?.length ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No location data available.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/40">
                  {locationQuery.data.map((loc) => {
                    const expanded = expandedLocations.has(loc.storeId);
                    return (
                      <div key={loc.storeId}>
                        <button
                          className="w-full flex items-center gap-4 px-6 py-4 hover:bg-zinc-800/20 transition-colors text-left"
                          onClick={() => setExpandedLocations(prev => {
                            const next = new Set(prev);
                            if (expanded) next.delete(loc.storeId);
                            else next.add(loc.storeId);
                            return next;
                          })}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{loc.storeName}</p>
                            <p className="text-zinc-500 text-xs mt-0.5">
                              {loc.totalSent} sent · ${loc.estimatedCost.toFixed(2)} est. cost
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-violet-300 text-xs font-semibold">{loc.fromAllowance}</p>
                              <p className="text-zinc-600 text-[10px]">allowance</p>
                            </div>
                            <div className="text-right">
                              <p className="text-emerald-300 text-xs font-semibold">{loc.fromCredits}</p>
                              <p className="text-zinc-600 text-[10px]">credits</p>
                            </div>
                            {expanded ? (
                              <ChevronUp className="w-4 h-4 text-zinc-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-zinc-500" />
                            )}
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-6 pb-4 bg-zinc-800/20 border-t border-zinc-800/40">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                              {[
                                { label: "Total SMS", value: loc.totalSent.toLocaleString(), color: "text-white" },
                                { label: "Allowance", value: loc.fromAllowance.toLocaleString(), color: "text-violet-300" },
                                { label: "Credits", value: loc.fromCredits.toLocaleString(), color: "text-emerald-300" },
                                { label: "Est. Cost", value: `$${loc.estimatedCost.toFixed(2)}`, color: "text-amber-300" },
                              ].map(({ label, value, color }) => (
                                <div key={label} className="bg-zinc-900/60 rounded-lg p-3">
                                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                                  <p className="text-zinc-500 text-[10px] mt-0.5 uppercase tracking-wider">{label}</p>
                                </div>
                              ))}
                            </div>
                            {/* Allowance vs credits bar */}
                            {loc.totalSent > 0 && (
                              <div className="mt-3">
                                <p className="text-zinc-600 text-[10px] mb-1.5 uppercase tracking-wider">Allowance vs Credits split</p>
                                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
                                  <div
                                    className="h-full bg-violet-500 transition-all"
                                    style={{ width: `${(loc.fromAllowance / loc.totalSent) * 100}%` }}
                                  />
                                  <div
                                    className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${(loc.fromCredits / loc.totalSent) * 100}%` }}
                                  />
                                </div>
                                <div className="flex gap-4 mt-1.5">
                                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                                    <span className="w-2 h-2 rounded-full bg-violet-500" /> Allowance
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Credits
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
