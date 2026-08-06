import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Users, AlertTriangle, Wallet, DollarSign,
  XCircle, CreditCard, BarChart3, RefreshCw, Loader2, CheckCircle,
  Zap, ArrowUpCircle, Store, History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminBillingStats {
  activeSubs: number;
  trialingSubs: number;
  pastDueSubs: number;
  churnedSubs: number;
  mrrCents: number;
  walletDepositCents: number;
  totalDepositCount: number;
  failedPayments: number;
  paidInvoices: number;
  totalRevenueCents: number;
}

interface AutoRefillStats {
  totals: {
    autoRefillCount: number;
    autoRefillTotalDollars: number;
    storesWithRefills: number;
    avgRefillAmount: number;
    enabledCount: number;
  };
  topStores: {
    storeId: number;
    storeName: string;
    refillCount: number;
    totalRefilled: number;
    lastRefillAt: string;
  }[];
  recent: {
    id: number;
    storeId: number;
    storeName: string;
    amount: number;
    balanceAfter: number;
    referenceId: string | null;
    createdAt: string;
  }[];
  staleStores: {
    storeId: number;
    storeName: string;
    threshold: number;
    amount: number;
    currentBalance: number;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchStats(): Promise<AdminBillingStats> {
  const res = await fetch("/api/billing/admin/stats", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load billing stats");
  return res.json();
}

async function fetchAutoRefillStats(): Promise<AutoRefillStats> {
  const res = await fetch("/api/billing/admin/auto-refill-stats", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load auto-refill stats");
  return res.json();
}

function fmt(cents: number): string {
  const n = cents / 100;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDollars(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BillingDashboard() {
  const { data: stats, isLoading, error, refetch, isFetching } = useQuery<AdminBillingStats>({
    queryKey: ["admin-billing-stats"],
    queryFn: fetchStats,
    refetchInterval: 60_000,
  });

  const { data: arStats, isLoading: arLoading, refetch: arRefetch, isFetching: arFetching } = useQuery<AutoRefillStats>({
    queryKey: ["admin-auto-refill-stats"],
    queryFn: fetchAutoRefillStats,
    refetchInterval: 60_000,
  });

  function handleRefresh() {
    refetch();
    arRefetch();
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Billing Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Platform-wide revenue & subscription metrics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isFetching || arFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(isFetching || arFetching) ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 py-12 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading billing metrics…</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Failed to load billing stats. Make sure STRIPE_SECRET_KEY is configured and billing routes are active.
        </div>
      )}

      {stats && (
        <>
          {/* MRR Hero */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="sm:col-span-1 bg-gradient-to-br from-violet-600 to-violet-700 border-0 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 opacity-80" />
                  <p className="text-violet-200 text-xs font-semibold uppercase tracking-widest">Monthly Recurring Revenue</p>
                </div>
                <p className="text-4xl font-bold tracking-tight">{fmtFull(stats.mrrCents)}</p>
                <p className="text-violet-300 text-xs mt-1">ARR estimate: {fmtFull(stats.mrrCents * 12)}</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-zinc-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest">Total Revenue</p>
                </div>
                <p className="text-3xl font-bold text-zinc-900">{fmtFull(stats.totalRevenueCents)}</p>
                <p className="text-zinc-400 text-xs mt-1">{stats.paidInvoices} paid invoices</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-zinc-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="w-4 h-4 text-blue-500" />
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest">Wallet Deposits</p>
                </div>
                <p className="text-3xl font-bold text-zinc-900">{fmtFull(stats.walletDepositCents)}</p>
                <p className="text-zinc-400 text-xs mt-1">{stats.totalDepositCount} total deposits</p>
              </CardContent>
            </Card>
          </div>

          {/* Subscriber breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
              label="Active Subscribers"
              value={stats.activeSubs}
              badge={{ label: "Paying", color: "emerald" }}
            />
            <MetricCard
              icon={<Users className="w-4 h-4 text-violet-500" />}
              label="Trialing"
              value={stats.trialingSubs}
              badge={{ label: "Trial", color: "violet" }}
            />
            <MetricCard
              icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
              label="Past Due"
              value={stats.pastDueSubs}
              badge={{ label: "At risk", color: "amber" }}
            />
            <MetricCard
              icon={<XCircle className="w-4 h-4 text-red-500" />}
              label="Churned"
              value={stats.churnedSubs}
              badge={{ label: "Canceled", color: "red" }}
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment health */}
            <Card className="bg-white border-zinc-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-zinc-400" />
                  Payment Health
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                  <span className="text-sm text-zinc-600">Paid Invoices</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-900">{stats.paidInvoices}</span>
                    <span className="text-xs text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">✓</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-zinc-600">Failed Payments</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-900">{stats.failedPayments}</span>
                    {stats.failedPayments > 0 && (
                      <span className="text-xs text-red-600 bg-red-50 rounded-full px-2 py-0.5">!</span>
                    )}
                  </div>
                </div>
                {stats.failedPayments > 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    {stats.failedPayments} unpaid invoice{stats.failedPayments !== 1 ? "s" : ""} — check Stripe dashboard for retry options.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Subscription overview */}
            <Card className="bg-white border-zinc-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-zinc-400" />
                  Subscription Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                {[
                  { label: "Active",    value: stats.activeSubs,   color: "bg-emerald-500" },
                  { label: "Trialing",  value: stats.trialingSubs, color: "bg-violet-500" },
                  { label: "Past Due",  value: stats.pastDueSubs,  color: "bg-amber-500" },
                  { label: "Churned",   value: stats.churnedSubs,  color: "bg-red-400" },
                ].map(({ label, value, color }) => {
                  const total = stats.activeSubs + stats.trialingSubs + stats.pastDueSubs + stats.churnedSubs;
                  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-zinc-600">
                        <span>{label}</span>
                        <span className="font-semibold text-zinc-800">{value} <span className="text-zinc-400 font-normal">({pct}%)</span></span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Auto-Refill Activity Panel ─────────────────────────────────────── */}
      <div className="border-t border-zinc-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-zinc-900">Auto-Refill Activity</h2>
          <span className="text-xs text-zinc-400 font-normal ml-1">Platform-wide AI credits auto-charge metrics</span>
        </div>

        {arLoading && (
          <div className="flex items-center gap-3 py-8 text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading auto-refill metrics…</span>
          </div>
        )}

        {arStats && (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100/60 border-amber-200/60">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpCircle className="w-4 h-4 text-amber-500" />
                    <p className="text-amber-700 text-[11px] font-semibold uppercase tracking-wider">Total Refills Fired</p>
                  </div>
                  <p className="text-3xl font-bold text-amber-900">{arStats.totals.autoRefillCount.toLocaleString()}</p>
                  <p className="text-amber-600 text-xs mt-1">across {arStats.totals.storesWithRefills} stores</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-emerald-200/60">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                    <p className="text-emerald-700 text-[11px] font-semibold uppercase tracking-wider">Revenue Auto-Charged</p>
                  </div>
                  <p className="text-3xl font-bold text-emerald-900">{fmtDollars(arStats.totals.autoRefillTotalDollars)}</p>
                  <p className="text-emerald-600 text-xs mt-1">avg {fmtDollars(arStats.totals.avgRefillAmount)} per refill</p>
                </CardContent>
              </Card>

              <Card className="bg-white border-zinc-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-violet-500" />
                    <p className="text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">Stores with Auto-Refill ON</p>
                  </div>
                  <p className="text-3xl font-bold text-zinc-900">{arStats.totals.enabledCount}</p>
                  <p className="text-zinc-400 text-xs mt-1">have saved payment method</p>
                </CardContent>
              </Card>

              <Card className={`border-zinc-200 ${arStats.staleStores.length > 0 ? "bg-amber-50 border-amber-200/60" : "bg-white"}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`w-4 h-4 ${arStats.staleStores.length > 0 ? "text-amber-500" : "text-zinc-400"}`} />
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${arStats.staleStores.length > 0 ? "text-amber-700" : "text-zinc-500"}`}>
                      Enabled, No Recent Refill
                    </p>
                  </div>
                  <p className={`text-3xl font-bold ${arStats.staleStores.length > 0 ? "text-amber-900" : "text-zinc-900"}`}>
                    {arStats.staleStores.length}
                  </p>
                  <p className={`text-xs mt-1 ${arStats.staleStores.length > 0 ? "text-amber-600" : "text-zinc-400"}`}>
                    {arStats.staleStores.length > 0 ? "may need attention" : "all stores healthy"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Top stores + Recent refills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Top stores by volume */}
              <Card className="bg-white border-zinc-200">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                    <Store className="w-4 h-4 text-zinc-400" />
                    Top Stores by Auto-Refill Volume
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {arStats.topStores.length === 0 ? (
                    <p className="text-zinc-400 text-sm py-4 text-center">No auto-refills yet</p>
                  ) : (
                    <div className="space-y-3">
                      {arStats.topStores.map((store, i) => (
                        <div key={store.storeId} className="flex items-center gap-3">
                          <span className="text-zinc-300 text-xs font-bold w-4 text-right">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-zinc-800 text-sm font-semibold truncate">{store.storeName}</p>
                            <p className="text-zinc-400 text-xs">
                              {store.refillCount} refill{store.refillCount !== 1 ? "s" : ""} · last {fmtDateShort(store.lastRefillAt)}
                            </p>
                          </div>
                          <span className="text-emerald-600 text-sm font-bold flex-shrink-0">
                            {fmtDollars(store.totalRefilled)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent refill transactions */}
              <Card className="bg-white border-zinc-200">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                    <History className="w-4 h-4 text-zinc-400" />
                    Recent Auto-Refills
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {arStats.recent.length === 0 ? (
                    <p className="text-zinc-400 text-sm py-4 text-center">No auto-refills recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {arStats.recent.map(entry => (
                        <div key={entry.id} className="flex items-center justify-between py-2 border-b border-zinc-50 last:border-0">
                          <div className="min-w-0">
                            <p className="text-zinc-800 text-xs font-semibold truncate">{entry.storeName}</p>
                            <p className="text-zinc-400 text-xs">{fmtDate(entry.createdAt)}</p>
                          </div>
                          <div className="text-right flex-shrink-0 pl-3">
                            <p className="text-emerald-600 text-xs font-bold">+${entry.amount.toFixed(2)}</p>
                            <p className="text-zinc-400 text-xs">bal ${entry.balanceAfter.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Stale stores detail (if any) */}
            {arStats.staleStores.length > 0 && (
              <Card className="bg-amber-50 border-amber-200/60">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Auto-Refill Enabled — No Refill in 30 Days
                  </CardTitle>
                  <p className="text-amber-600 text-xs mt-0.5">These stores have auto-refill on but haven't triggered in the last 30 days. May have a stale payment method or their balance hasn't dipped below the threshold yet.</p>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="space-y-2">
                    {arStats.staleStores.map(store => (
                      <div key={store.storeId} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                        <div className="min-w-0">
                          <p className="text-amber-900 text-sm font-semibold truncate">{store.storeName}</p>
                          <p className="text-amber-600 text-xs">
                            Triggers at ${store.threshold} · refills ${store.amount}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 pl-3">
                          <p className={`text-xs font-bold ${store.currentBalance < 0 ? "text-red-600" : store.currentBalance < store.threshold ? "text-amber-600" : "text-zinc-600"}`}>
                            {store.currentBalance < 0 ? `-$${Math.abs(store.currentBalance).toFixed(2)}` : `$${store.currentBalance.toFixed(2)}`}
                          </p>
                          <p className="text-amber-500 text-xs">balance</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Stripe link */}
      {stats && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
          <CreditCard className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-700">Full billing details in Stripe Dashboard</p>
            <p className="text-xs text-zinc-400 mt-0.5">Invoices, disputes, refunds, and client records are managed directly in Stripe.</p>
          </div>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-violet-600 hover:text-violet-500 font-medium whitespace-nowrap"
          >
            Open Stripe →
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  badge: { label: string; color: "emerald" | "violet" | "amber" | "red" };
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700",
    violet:  "bg-violet-50 text-violet-700",
    amber:   "bg-amber-50 text-amber-700",
    red:     "bg-red-50 text-red-700",
  };

  return (
    <Card className="bg-white border-zinc-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          {icon}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${colors[badge.color]}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-3xl font-bold text-zinc-900">{value.toLocaleString()}</p>
        <p className="text-zinc-500 text-xs mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
