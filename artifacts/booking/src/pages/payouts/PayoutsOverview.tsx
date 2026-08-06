import { useQuery } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  DollarSign, Users, Clock, CheckCircle2, TrendingUp, AlertCircle,
  ArrowUpRight, Plus, Zap, Building2, CreditCard, FileText,
  MoreHorizontal, PlayCircle, Printer, BarChart3, XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TransferFailure = {
  id: number;
  contractorId: number;
  firstName: string | null;
  lastName: string | null;
  amountCents: number;
  failureReason: string | null;
  appointmentId: number | null;
  createdAt: string;
};

type Overview = {
  activeContractors: number;
  pendingPayouts: { count: number; total: number };
  thisMonth: { total: number; runs: number };
  ytd: number;
  recentRuns: Array<{
    id: number; periodStart: string; periodEnd: string; status: string;
    totalNet: string; contractorCount: number; createdAt: string;
  }>;
  monthlyTrend: Array<{ month: string; total: number }>;
};

function fmt$(n: number | string) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_BADGE: Record<string, string> = {
  draft:      "bg-gray-100 text-gray-600",
  pending:    "bg-amber-50 text-amber-700",
  processing: "bg-blue-50 text-blue-700",
  completed:  "bg-emerald-50 text-emerald-700",
  failed:     "bg-red-50 text-red-700",
  cancelled:  "bg-gray-100 text-gray-500",
};

export default function PayoutsOverview() {
  const { selectedStore } = useSelectedStore();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["/api/contractor-payouts/overview", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/overview?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
    enabled: !!selectedStore?.id,
    refetchInterval: 60_000,
  });

  const { data: failuresData } = useQuery<{ failures: TransferFailure[] }>({
    queryKey: ["/api/payments/stripe/instant-transfer-failures", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/payments/stripe/instant-transfer-failures", { credentials: "include" });
      if (!res.ok) return { failures: [] };
      return res.json();
    },
    enabled: !!selectedStore?.id,
    refetchInterval: 60_000,
  });

  const failures = failuresData?.failures ?? [];

  const trendMax = Math.max(...(data?.monthlyTrend ?? []).map(m => m.total), 1);

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-3 gap-5">
          <Skeleton className="col-span-2 h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: "Paid This Month",
      value: fmt$(data?.thisMonth.total ?? 0),
      sub: `${data?.thisMonth.runs ?? 0} payout runs`,
      icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50",
    },
    {
      label: "Active Contractors",
      value: String(data?.activeContractors ?? 0),
      sub: "Across this location",
      icon: Users, color: "text-violet-600", bg: "bg-violet-50",
    },
    {
      label: "Pending Payouts",
      value: fmt$(data?.pendingPayouts.total ?? 0),
      sub: `${data?.pendingPayouts.count} contractors`,
      icon: Clock, color: "text-amber-600", bg: "bg-amber-50",
    },
    {
      label: "YTD Total",
      value: fmt$(data?.ytd ?? 0),
      sub: `${new Date().getFullYear()} earnings disbursed`,
      icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Contractor Payouts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedStore?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/payouts/reports")} className="rounded-xl gap-2">
            <BarChart3 className="w-4 h-4" /> Reports
          </Button>
          <Button size="sm" onClick={() => navigate("/payouts/run")}
            className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white shadow-sm">
            <Plus className="w-4 h-4" /> Run Payouts
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                {s.value}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Monthly trend chart */}
        <Card className="col-span-2 rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>Monthly Payout Trend</CardTitle>
              <span className="text-xs text-gray-400">Last 6 months</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-36 mt-2">
              {(data?.monthlyTrend ?? []).map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs text-gray-500 font-medium">{m.total > 0 ? fmt$(m.total) : ""}</span>
                  <div className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${Math.max(4, (m.total / trendMax) * 100)}px`,
                      background: i === (data?.monthlyTrend.length ?? 0) - 1 ? "#0d9488" : "#ccede9",
                    }}
                  />
                  <span className="text-xs text-gray-400">{m.month}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {[
              { icon: PlayCircle, label: "Run Payouts", sub: "Create a new payout batch", color: "text-teal-600", bg: "bg-teal-50", path: "/payouts/run" },
              { icon: Building2, label: "Manage Contractors", sub: `${data?.activeContractors ?? 0} active`, color: "text-violet-600", bg: "bg-violet-50", path: "/payouts/contractors" },
              { icon: Printer, label: "Check Register", sub: "Print & manage checks", color: "text-slate-600", bg: "bg-slate-50", path: "/payouts/checks" },
              { icon: FileText, label: "Tax Documents", sub: "W9 & 1099 management", color: "text-blue-600", bg: "bg-blue-50", path: "/payouts/tax-docs" },
            ].map((a) => (
              <button key={a.label} onClick={() => navigate(a.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left border border-gray-100 transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.bg} shrink-0`}>
                  <a.icon className={`w-4 h-4 ${a.color}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{a.label}</div>
                  <div className="text-xs text-gray-400">{a.sub}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent runs */}
      <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-gray-50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>Recent Payout Runs</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/payouts/run")} className="text-teal-600 text-xs">
              View all →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(data?.recentRuns ?? []).length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No payout runs yet.{" "}
              <button className="text-teal-600 hover:underline" onClick={() => navigate("/payouts/run")}>
                Create the first one →
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-6 py-3">Period</th>
                  <th className="text-left px-6 py-3">Contractors</th>
                  <th className="text-left px-6 py-3">Net Total</th>
                  <th className="text-left px-6 py-3">Created</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {(data?.recentRuns ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/40 transition-colors cursor-pointer"
                    onClick={() => navigate(`/payouts/run?runId=${r.id}`)}>
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {r.periodStart} – {r.periodEnd}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{r.contractorCount}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{fmt$(r.totalNet)}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {format(new Date(r.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <MoreHorizontal className="w-4 h-4 text-gray-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Failed instant transfers alert */}
      {failures.length > 0 && (
        <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-red-100 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <CardTitle className="text-base text-red-800" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Failed Instant Transfers
                </CardTitle>
                <span className="inline-flex items-center rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {failures.length}
                </span>
              </div>
              <span className="text-xs text-red-400">Last 30 days</span>
            </div>
            <p className="text-xs text-red-600 mt-1">
              These instant payouts failed after client payments were captured. Contractors may not have received their commission — review and resolve.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-100/50 text-xs font-medium text-red-400 uppercase tracking-wide">
                  <th className="text-left px-6 py-2.5">Contractor</th>
                  <th className="text-left px-6 py-2.5">Amount</th>
                  <th className="text-left px-6 py-2.5">Reason</th>
                  <th className="text-left px-6 py-2.5">When</th>
                  <th className="text-left px-6 py-2.5">Appt</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id} className="border-t border-red-100 hover:bg-red-100/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-800">
                      {[f.firstName, f.lastName].filter(Boolean).join(" ") || `Contractor #${f.contractorId}`}
                    </td>
                    <td className="px-6 py-3 font-semibold text-gray-900">{fmt$(f.amountCents / 100)}</td>
                    <td className="px-6 py-3 text-red-600 text-xs max-w-[240px] truncate" title={f.failureReason ?? undefined}>
                      {f.failureReason ?? "Unknown error"}
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs">
                      {f.appointmentId ? (
                        <button
                          className="text-teal-600 hover:underline"
                          onClick={() => navigate(`/calendar?appointmentId=${f.appointmentId}`)}
                        >
                          #{f.appointmentId}
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Pending banner */}
      {(data?.pendingPayouts.count ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {data!.pendingPayouts.count} contractor{data!.pendingPayouts.count !== 1 ? "s" : ""} have unpaid earnings ({fmt$(data!.pendingPayouts.total)})
            </p>
            <p className="text-sm text-amber-600 mt-0.5">Run payouts to send their earnings.</p>
          </div>
          <Button size="sm" onClick={() => navigate("/payouts/run")}
            className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl shrink-0">
            Run Now
          </Button>
        </div>
      )}
    </div>
  );
}
