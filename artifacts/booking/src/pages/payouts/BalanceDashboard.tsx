/**
 * BalanceDashboard — Salon Owner Balance Management
 *
 * Shows the owner their true available Stripe balance after reserving
 * pending contractor commissions. Lets them request a withdrawal with
 * real-time validation against the available amount.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, Lock, TrendingDown, AlertTriangle,
  RefreshCw, Loader2, ArrowDownToLine, Calendar, Users, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BalanceData {
  stripe_balance:      number;
  stripe_pending:      number;
  pending_commissions: number;
  available_balance:   number;
  currency:            string;
  fetched_at:          string;
  next_payout_date:    string | null;
  is_insufficient:     boolean;
  formatted: {
    stripe_balance:      string;
    stripe_pending:      string;
    pending_commissions: string;
    available_balance:   string;
  };
}

interface CommissionGroup {
  contractor_id:   number;
  contractor_name: string;
  total_cents:     number;
  formatted_total: string;
  payouts: Array<{
    scheduled_payout_date: string;
    commission_count:      number;
    total_cents:           number;
    formatted_amount:      string;
  }>;
}

interface PendingCommissions {
  contractors:         CommissionGroup[];
  total_pending_cents: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dollarsToCents(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon: Icon, loading,
}: {
  label:    string;
  value:    string;
  sub?:     string;
  color:    string;
  icon:     any;
  loading?: boolean;
}) {
  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-28 mb-1" />
            ) : (
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            color.includes("emerald") ? "bg-emerald-50" :
            color.includes("red")    ? "bg-red-50"     :
            color.includes("amber")  ? "bg-amber-50"   :
            "bg-blue-50"
          }`}>
            <Icon className={`w-5 h-5 ${
              color.includes("emerald") ? "text-emerald-600" :
              color.includes("red")    ? "text-red-600"     :
              color.includes("amber")  ? "text-amber-600"   :
              "text-blue-600"
            }`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BalanceDashboard() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  const storeId = selectedStore?.id;

  // ── Fetch balance
  const {
    data: balance,
    isLoading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
    isFetching: balanceFetching,
  } = useQuery<BalanceData>({
    queryKey: ["/api/salon/balance", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/salon/balance?storeId=${storeId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch balance");
      }
      return res.json();
    },
    enabled: !!storeId,
    refetchInterval: 60_000, // refresh every 60s
  });

  // ── Fetch pending commissions breakdown
  const {
    data: pendingData,
    isLoading: pendingLoading,
  } = useQuery<PendingCommissions>({
    queryKey: ["/api/salon/pending-commissions", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/salon/pending-commissions?storeId=${storeId}`);
      if (!res.ok) throw new Error("Failed to fetch commissions");
      return res.json();
    },
    enabled: !!storeId,
  });

  // ── Request payout mutation
  const payoutMutation = useMutation({
    mutationFn: async (amountCents: number) => {
      const res = await fetch("/api/salon/request-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payout failed");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Payout initiated",
        description: `Transfer of ${(data.amount_cents / 100).toFixed(2)} is on its way to your bank.`,
      });
      setWithdrawAmount("");
      setShowWithdrawForm(false);
      refetchBalance();
    },
    onError: (err: Error) => {
      toast({
        title: "Payout blocked",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handlePayout = () => {
    const cents = dollarsToCents(withdrawAmount);
    if (cents <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    payoutMutation.mutate(cents);
  };

  const availableCents  = balance?.available_balance ?? 0;
  const withdrawCents   = dollarsToCents(withdrawAmount);
  const willOverdraw    = withdrawCents > availableCents && withdrawCents > 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (balanceError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {(balanceError as Error).message}
            {String((balanceError as Error).message).includes("connected Stripe") && (
              <> — <a href="/manage/payment-settings" className="underline">connect Stripe</a> first.</>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Balance & Withdrawals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Your available balance after reserving pending contractor commissions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchBalance()}
          disabled={balanceFetching}
        >
          {balanceFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {/* Insufficient balance warning */}
      {balance?.is_insufficient && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Balance alert:</strong> Your pending contractor commissions (
            {balance.formatted.pending_commissions}) exceed your current Stripe balance (
            {balance.formatted.stripe_balance}). Contractor payouts may fail unless funds are
            added before {balance.next_payout_date ? fmtDate(balance.next_payout_date) : "the next payout date"}.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total Stripe Balance"
          value={balance?.formatted.stripe_balance ?? "—"}
          sub={balance ? `${balance.formatted.stripe_pending} pending clearance` : undefined}
          color="text-blue-700"
          icon={DollarSign}
          loading={balanceLoading}
        />
        <KpiCard
          label="Contractor Reserves"
          value={balance ? `−${balance.formatted.pending_commissions}` : "—"}
          sub={balance?.next_payout_date ? `Next payout: ${fmtDate(balance.next_payout_date)}` : "No upcoming payouts"}
          color="text-amber-700"
          icon={Lock}
          loading={balanceLoading}
        />
        <KpiCard
          label="Available for Withdrawal"
          value={balance ? (balance.available_balance < 0 ? "−" : "") + balance.formatted.available_balance : "—"}
          sub="Stripe balance minus reserves"
          color={
            !balance ? "text-gray-700" :
            balance.is_insufficient ? "text-red-700" :
            "text-emerald-700"
          }
          icon={balance?.is_insufficient ? TrendingDown : CheckCircle2}
          loading={balanceLoading}
        />
      </div>

      {/* Withdraw section */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-teal-600" />
            Withdraw Funds to Bank
          </CardTitle>
          <CardDescription>
            Transfers from your Stripe account to your linked bank. Only funds above the
            contractor reserve can be withdrawn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showWithdrawForm ? (
            <Button
              onClick={() => setShowWithdrawForm(true)}
              disabled={balanceLoading || availableCents <= 0}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              Request Withdrawal
            </Button>
          ) : (
            <div className="space-y-4 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="withdraw-amount">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <Input
                    id="withdraw-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    className={`pl-7 ${willOverdraw ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                  />
                </div>
                {balance && (
                  <p className="text-xs text-gray-500">
                    Max available: <span className="font-semibold text-emerald-700">
                      {balance.formatted.available_balance}
                    </span>
                  </p>
                )}
              </div>

              {willOverdraw && balance && (
                <Alert variant="destructive" className="py-2 px-3">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">
                    Insufficient available balance. You have {balance.formatted.available_balance} available.
                    {balance.formatted.pending_commissions !== "$0.00" && (
                      <> {balance.formatted.pending_commissions} is reserved for contractor commissions
                        {balance.next_payout_date && ` scheduled for ${fmtDate(balance.next_payout_date)}`}.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handlePayout}
                  disabled={payoutMutation.isPending || willOverdraw || withdrawCents <= 0}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {payoutMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  Confirm Withdrawal
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowWithdrawForm(false); setWithdrawAmount(""); }}
                  disabled={payoutMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending commissions breakdown */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600" />
            Reserved Contractor Commissions
          </CardTitle>
          <CardDescription>
            These amounts are locked until each contractor's payout date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : !pendingData?.contractors.length ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
              No pending commissions — all contractor funds are cleared.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingData.contractors.map(c => (
                <div
                  key={c.contractor_id}
                  className="border border-gray-100 rounded-xl p-4 bg-amber-50/40"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                        {c.contractor_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-sm text-gray-900">{c.contractor_name}</span>
                    </div>
                    <span className="font-bold text-amber-700 text-sm">{c.formatted_total}</span>
                  </div>
                  <div className="space-y-1 pl-10">
                    {c.payouts.map(p => (
                      <div key={p.scheduled_payout_date} className="flex items-center justify-between text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-amber-500" />
                          Pays out {fmtDate(p.scheduled_payout_date)}
                          <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                            {p.commission_count} {p.commission_count === 1 ? "service" : "services"}
                          </Badge>
                        </span>
                        <span className="font-medium text-gray-800">{p.formatted_amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div className="flex items-center justify-between px-4 py-2 bg-amber-100 rounded-lg">
                <span className="text-sm font-semibold text-amber-800">Total Reserved</span>
                <span className="text-sm font-bold text-amber-900">
                  {pendingData.contractors.reduce((s, c) => s + c.total_cents, 0) > 0
                    ? `$${(pendingData.total_pending_cents / 100).toFixed(2)}`
                    : "$0.00"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {balance && (
        <p className="text-[11px] text-gray-400 text-right">
          Balance fetched {new Date(balance.fetched_at).toLocaleTimeString()} ·{" "}
          <button className="underline" onClick={() => refetchBalance()}>refresh</button>
        </p>
      )}
    </div>
  );
}
