/**
 * SubscriptionPage — Owner-facing plan management + usage analytics.
 *
 * Sections:
 *  1. Current Plan card (plan name, status, renewal date)
 *  2. Usage Dashboard — 4 countable-limit meters (staff, SMS, locations, websites)
 *  3. Available Plans grid — plan cards with feature list + Subscribe button
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle, Zap, Users, MessageSquare, MapPin, Globe,
  Loader2, Crown, BarChart2, Infinity, CalendarClock, XCircle, AlertTriangle,
  Receipt, Download, ExternalLink, RefreshCw,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanFeatureRow {
  featureId: string;
  featureName: string;
  featureCategory: string;
  limitValue: number | null;
  enabled: boolean;
  featureDescription: string | null;
}

interface PublicPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  sortOrder: number;
  features: PlanFeatureRow[];
}

interface CurrentPlan {
  id: number;
  code: string;
  name: string;
  priceMonthly: number;
  description: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean | null;
}

interface UsageMetric {
  id: string;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  enabled: boolean;
}

interface UsageData {
  planCode: string;
  metrics: UsageMetric[];
}

interface StoreInvoice {
  id: number;
  invoiceNumber: string | null;
  status: string | null;
  paid: boolean;
  totalCents: number;
  amountPaidCents: number;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  billingReason: string | null;
  createdAt: string;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchPublicPlans(): Promise<PublicPlan[]> {
  const res = await fetch("/api/plans/public-plans");
  if (!res.ok) throw new Error("Failed to load plans");
  return res.json();
}

async function fetchCurrentPlan(): Promise<CurrentPlan | null> {
  const res = await fetch("/api/plans/my-plan");
  if (!res.ok) return null;
  return res.json();
}

async function fetchUsage(): Promise<UsageData> {
  const res = await fetch("/api/subscription/usage");
  if (!res.ok) throw new Error("Failed to load usage");
  return res.json();
}

async function fetchInvoices(): Promise<StoreInvoice[]> {
  const res = await fetch("/api/subscription/invoices");
  if (!res.ok) throw new Error("Failed to load invoices");
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METRIC_ICONS: Record<string, React.ElementType> = {
  staff: Users,
  sms_credits: MessageSquare,
  locations: MapPin,
  website_builder: Globe,
};

function pct(used: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function barColor(p: number): string {
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-amber-400";
  return "bg-teal-500";
}

function fmtPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}/mo`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageMeter({ metric }: { metric: UsageMetric }) {
  const Icon = METRIC_ICONS[metric.id] ?? BarChart2;
  const percentage = pct(metric.used, metric.limit);
  const unlimited = metric.limit === null;

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-teal-600" />
          </div>
          <span className="text-sm font-medium text-zinc-700">{metric.label}</span>
        </div>
        {unlimited ? (
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            <Infinity className="w-3.5 h-3.5" /> Unlimited
          </span>
        ) : (
          <span className="text-xs text-zinc-500">
            {metric.used} / {metric.limit}
          </span>
        )}
      </div>

      {!unlimited && (
        <div className="space-y-1">
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", barColor(percentage))}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {percentage >= 90 && (
            <p className="text-xs text-red-500 font-medium">
              {metric.remaining === 0 ? "Limit reached" : `${metric.remaining} remaining`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  onSubscribe,
  subscribing,
}: {
  plan: PublicPlan;
  isCurrent: boolean;
  onSubscribe: (planId: number) => void;
  subscribing: boolean;
}) {
  const isFree = plan.priceMonthly === 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 flex flex-col gap-4 transition-shadow",
        isCurrent
          ? "border-teal-400 ring-2 ring-teal-400/30 bg-teal-50/40 shadow-sm"
          : "border-zinc-200 bg-white hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-zinc-900 text-base">{plan.name}</h3>
            {isCurrent && (
              <Badge className="bg-teal-500 text-white text-xs px-2 py-0.5 rounded-full">
                Current Plan
              </Badge>
            )}
          </div>
          {plan.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{plan.description}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-zinc-900">{fmtPrice(plan.priceMonthly)}</p>
          {plan.priceYearly > 0 && (
            <p className="text-xs text-zinc-400">${(plan.priceYearly / 100).toFixed(0)}/yr</p>
          )}
        </div>
      </div>

      {plan.features.length > 0 && (
        <ul className="space-y-1.5">
          {plan.features.map((f) => (
            <li key={f.featureId} className="flex items-center gap-2 text-sm text-zinc-700">
              <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
              <span>
                {f.featureName}
                {f.limitValue !== null && (
                  <span className="text-zinc-400 ml-1">({f.limitValue})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isCurrent ? (
        <div className="mt-auto pt-2">
          <div className="flex items-center gap-1.5 text-sm text-teal-600 font-medium">
            <Crown className="w-4 h-4" />
            Active
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          className="mt-auto"
          variant={isFree ? "outline" : "default"}
          disabled={subscribing}
          onClick={() => onSubscribe(plan.id)}
        >
          {subscribing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Zap className="w-4 h-4 mr-1.5" />
          )}
          {isFree ? "Switch to Free" : "Subscribe"}
        </Button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle return from Stripe Checkout
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      toast({ title: "Payment successful", description: "Your subscription has been activated." });
      queryClient.invalidateQueries({ queryKey: ["my-plan"] });
      queryClient.invalidateQueries({ queryKey: ["public-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
      setSearchParams({}, { replace: true });
    } else if (status === "cancelled") {
      toast({ title: "Checkout cancelled", description: "Your plan was not changed.", variant: "destructive" });
      setSearchParams({}, { replace: true });
    }
  }, []);

  const { data: plans = [], isLoading: plansLoading } = useQuery<PublicPlan[]>({
    queryKey: ["public-plans"],
    queryFn: fetchPublicPlans,
  });

  const { data: currentPlan, isLoading: planLoading } = useQuery<CurrentPlan | null>({
    queryKey: ["my-plan"],
    queryFn: fetchCurrentPlan,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageData>({
    queryKey: ["subscription-usage"],
    queryFn: fetchUsage,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<StoreInvoice[]>({
    queryKey: ["subscription-invoices"],
    queryFn: fetchInvoices,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await fetch("/api/subscription/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to subscribe");
      }
      return res.json();
    },
    onMutate: (planId) => setSubscribingId(planId),
    onSettled: () => setSubscribingId(null),
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({ title: "Plan updated", description: "Your subscription has been updated." });
      queryClient.invalidateQueries({ queryKey: ["my-plan"] });
      queryClient.invalidateQueries({ queryKey: ["public-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
    },
    onError: (err: Error) => {
      const isConfigError = err.message.toLowerCase().includes("not been configured");
      toast({
        title: isConfigError ? "Plan not available" : "Subscription error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/reactivate", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reactivate subscription");
      }
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["my-plan"] });
      const previous = queryClient.getQueryData<CurrentPlan>(["my-plan"]);
      if (previous) {
        queryClient.setQueryData<CurrentPlan>(["my-plan"], {
          ...previous,
          cancelAtPeriodEnd: false,
        });
      }
      return { previous };
    },
    onSuccess: () => {
      toast({
        title: "Subscription reactivated",
        description: "Your subscription will continue to renew automatically.",
      });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<CurrentPlan>(["my-plan"], context.previous);
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["my-plan"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to cancel subscription");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmCancel(false);
      if (data?.cancelAtPeriodEnd) {
        toast({
          title: "Subscription cancelled",
          description: "You'll keep access until the end of your billing period.",
        });
      } else {
        toast({ title: "Subscription cancelled", description: "Your subscription has been cancelled." });
      }
      queryClient.invalidateQueries({ queryKey: ["my-plan"] });
    },
    onError: (err: Error) => {
      setConfirmCancel(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const loading = plansLoading || planLoading || usageLoading;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden gap-4">

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Subscription</h1>
            <p className="text-sm text-zinc-500">Manage your plan and track feature usage.</p>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
        </div>

        {/* ── Two-column body ── */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-5 overflow-auto lg:overflow-hidden">

          {/* ── Left column: Current Plan + Usage ── */}
          <div className="flex flex-col gap-4 overflow-hidden min-h-0">

            {/* Current Plan */}
            {!loading && currentPlan && (
              <div className={cn(
                "shrink-0 border rounded-xl p-4 space-y-3",
                currentPlan.cancelAtPeriodEnd
                  ? "bg-gradient-to-br from-amber-50 to-white border-amber-200"
                  : "bg-gradient-to-br from-teal-50 to-white border-teal-200"
              )}>
                <h2 className="text-sm font-semibold text-zinc-600 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500" /> Current Plan
                </h2>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className={cn(
                      "text-lg font-bold",
                      currentPlan.cancelAtPeriodEnd ? "text-amber-700" : "text-teal-700"
                    )}>{currentPlan.name}</p>
                    {currentPlan.description && (
                      <p className="text-xs text-zinc-500">{currentPlan.description}</p>
                    )}
                    {currentPlan.currentPeriodEnd && (
                      <p className="flex items-center gap-1 text-xs text-zinc-400">
                        <CalendarClock className="w-3 h-3 shrink-0" />
                        {currentPlan.cancelAtPeriodEnd ? "Access until" : "Renews"}{" "}
                        {new Date(currentPlan.currentPeriodEnd).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-zinc-900">{fmtPrice(currentPlan.priceMonthly)}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "mt-1 text-xs",
                        currentPlan.cancelAtPeriodEnd && "bg-amber-100 text-amber-700",
                        currentPlan.subscriptionStatus === "trialing" && !currentPlan.cancelAtPeriodEnd && "bg-amber-100 text-amber-700",
                        currentPlan.subscriptionStatus === "past_due" && "bg-red-100 text-red-700"
                      )}
                    >
                      {currentPlan.cancelAtPeriodEnd ? "Cancels at period end"
                        : currentPlan.subscriptionStatus === "trialing" ? "Trial"
                        : currentPlan.subscriptionStatus === "past_due" ? "Past Due"
                        : "Active"}
                    </Badge>
                  </div>
                </div>

                {/* Cancel */}
                {currentPlan.stripeSubscriptionId && !currentPlan.cancelAtPeriodEnd && (
                  <div className="border-t border-zinc-100 pt-2">
                    {!confirmCancel ? (
                      <button onClick={() => setConfirmCancel(true)}
                        className="text-xs text-zinc-400 hover:text-red-500 transition-colors flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Cancel subscription
                      </button>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600">
                            You'll keep access until{" "}
                            {currentPlan.currentPeriodEnd
                              ? new Date(currentPlan.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                              : "end of billing period"}. After that, your account moves to the free plan.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate()} className="h-7 text-xs">
                            {cancelMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            Yes, cancel
                          </Button>
                          <Button size="sm" variant="outline" disabled={cancelMutation.isPending}
                            onClick={() => setConfirmCancel(false)} className="h-7 text-xs">
                            Keep
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reactivate */}
                {currentPlan.cancelAtPeriodEnd && (
                  <div className="border-t border-amber-100 pt-2 space-y-2">
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Subscription cancels at end of billing period.
                    </p>
                    <Button size="sm" variant="outline" disabled={reactivateMutation.isPending}
                      onClick={() => reactivateMutation.mutate()}
                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                      {reactivateMutation.isPending
                        ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        : <RefreshCw className="w-3 h-3 mr-1" />}
                      Reactivate
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Usage */}
            {!loading && usage && (
              <div className="flex flex-col gap-2 overflow-hidden min-h-0">
                <h2 className="shrink-0 text-sm font-semibold text-zinc-600 flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-zinc-400" /> Usage This Period
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {usage.metrics.map((m) => <UsageMeter key={m.id} metric={m} />)}
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
                Loading…
              </div>
            )}
          </div>

          {/* ── Right column: Available Plans + Billing History ── */}
          <div className="flex flex-col gap-4 overflow-hidden min-h-0">

            {/* Available Plans */}
            {!loading && plans.length > 0 && (
              <div className="shrink-0 space-y-2">
                <h2 className="text-sm font-semibold text-zinc-600 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Available Plans
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isCurrent={currentPlan?.code === plan.code}
                      onSubscribe={(id) => subscribeMutation.mutate(id)}
                      subscribing={subscribingId === plan.id}
                    />
                  ))}
                </div>
                <p className="text-xs text-zinc-400">
                  Paid plans redirect to Stripe Checkout. Free plans take effect immediately.
                </p>
              </div>
            )}

            {!loading && plans.length === 0 && (
              <div className="shrink-0 text-center py-6 text-zinc-400">
                <Zap className="w-7 h-7 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No plans configured yet.</p>
                <p className="text-xs mt-0.5">Ask your platform admin to set up subscription plans.</p>
              </div>
            )}

            {/* Billing History */}
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
              <h2 className="shrink-0 text-sm font-semibold text-zinc-600 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-zinc-400" /> Billing History
              </h2>

              {invoicesLoading && (
                <div className="flex items-center gap-2 text-zinc-400 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading invoices…</span>
                </div>
              )}

              {!invoicesLoading && invoices.length === 0 && (
                <div className="border border-zinc-100 rounded-xl bg-zinc-50 py-8 text-center flex-1 flex flex-col items-center justify-center">
                  <Receipt className="w-7 h-7 mb-2 text-zinc-300" />
                  <p className="text-sm text-zinc-400">No invoices yet.</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Invoices will appear here after your first billing cycle.</p>
                </div>
              )}

              {!invoicesLoading && invoices.length > 0 && (
                <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white flex-1 min-h-0 overflow-y-auto"
                  style={{ scrollbarWidth: "none" }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="border-b border-zinc-100 bg-zinc-50">
                        <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Invoice #</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Description</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Amount</th>
                        <th className="text-center px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
                        <th className="px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide text-right">Links</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {invoices.map((inv) => {
                        const amountDollars = (inv.amountPaidCents > 0 ? inv.amountPaidCents : inv.totalCents) / 100;
                        const dateStr = new Date(inv.createdAt).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        });
                        const isPaid = inv.paid || inv.status === "paid";
                        const isFailed = inv.status === "uncollectible" || inv.status === "void";
                        const billingLabel = inv.billingReason === "subscription_cycle" ? "Renewal"
                          : inv.billingReason === "subscription_create" ? "New subscription"
                          : inv.billingReason ? inv.billingReason.replace(/_/g, " ") : "Invoice";
                        return (
                          <tr key={inv.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-3 py-2.5 text-zinc-700 whitespace-nowrap text-xs">{dateStr}</td>
                            <td className="px-3 py-2.5 text-zinc-500 hidden sm:table-cell font-mono text-xs">{inv.invoiceNumber ?? "—"}</td>
                            <td className="px-3 py-2.5 text-zinc-500 hidden sm:table-cell capitalize text-xs">{billingLabel}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-zinc-800 whitespace-nowrap text-xs">${amountDollars.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-center">
                              <Badge variant="secondary" className={cn(
                                "text-xs",
                                isPaid && "bg-teal-50 text-teal-700",
                                isFailed && "bg-red-50 text-red-600",
                                !isPaid && !isFailed && "bg-amber-50 text-amber-700"
                              )}>
                                {isPaid ? "Paid" : isFailed ? (inv.status === "void" ? "Void" : "Failed") : (inv.status ?? "Open")}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {inv.invoicePdfUrl && (
                                  <a href={inv.invoicePdfUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium" title="Download PDF">
                                    <Download className="w-3 h-3" />
                                    <span className="hidden sm:inline">PDF</span>
                                  </a>
                                )}
                                {inv.hostedInvoiceUrl && (
                                  <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700" title="View invoice">
                                    <ExternalLink className="w-3 h-3" />
                                    <span className="hidden sm:inline">View</span>
                                  </a>
                                )}
                                {!inv.invoicePdfUrl && !inv.hostedInvoiceUrl && (
                                  <span className="text-zinc-300 text-xs">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
