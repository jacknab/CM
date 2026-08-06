import { useState } from "react";
import AutoRefillCard from "./AutoRefillCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CreditCard, FileText, XCircle, CheckCircle, Clock, AlertTriangle,
  Download, ArrowLeft, Loader2, Zap, Shield, LifeBuoy, ChevronRight,
  Calendar, Pause,
  RefreshCw, ExternalLink, Info, BadgeCheck, Sparkles, Code2,
  MessageSquare, ShoppingCart, Wallet, PlusCircle, History,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ─── Plans ────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    code: "solo",
    name: "Solo",
    price: 9,
    tagline: "For independent stylists & booth renters",
    highlight: "1 calendar · 1 staff",
    features: ["1 calendar", "1 staff member", "Online booking page", "200 SMS/mo"],
    notIncluded: ["Payments & card reader"],
    apiDocs: false,
  },
  {
    code: "professional",
    name: "Professional",
    price: 22,
    tagline: "Everything, unlimited — any salon size",
    highlight: "Unlimited calendars & staff",
    features: ["Unlimited calendars", "Unlimited staff", "Online booking page", "Payments & card reader", "Unlimited SMS", "Google Business Profile sync", "Advanced reporting", "Priority support"],
    apiDocs: false,
  },
  {
    code: "elite",
    name: "Elite",
    price: 49,
    tagline: "Full API access for custom integrations",
    highlight: "Unlimited API · 50K SMS · Webhooks",
    features: ["Everything in Professional", "Unlimited API keys", "50,000 SMS credits/mo", "Chatbot & Dialer API", "Webhooks & real-time events", "1,000 API requests/min", "99.9% uptime SLA", "Priority support (4 h)"],
    apiDocs: true,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface BillingData {
  profile: any;
  subscription: any;
  stripeSub: any;
  plan: any;
  paymentMethod: { brand: string; last4: string; expMonth?: number; expYear?: number } | null;
  store: { id: number; name: string; email: string };
}


interface Invoice {
  id: number;
  stripeInvoiceId: string;
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

interface UpcomingInvoice {
  amountDueCents: number;
  nextPaymentAttempt: number | null;
  lines: { description: string; amountCents: number; quantity?: number }[];
  currency: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  billingEmail?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(cents: number | null | undefined): string {
  if (cents == null) return "$0";
  const n = Number(cents);
  if (n % 100 === 0) return `$${n / 100}`;
  return `$${(n / 100).toFixed(2)}`;
}

function fmtExact(cents: number | null | undefined): string {
  if (cents == null) return "$0.00";
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

/** Convert any value to a valid Date or null — never returns Invalid Date. */
function safeDate(val: unknown): Date | null {
  if (val == null) return null;
  const d = new Date(val as never);
  return isNaN(d.getTime()) ? null : d;
}

/** date-fns format() wrapped to return a fallback string on null / invalid dates. */
function safeFormat(val: unknown, pattern: string, fallback = "—"): string {
  const d = safeDate(val);
  return d ? format(d, pattern) : fallback;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

function cardBrandIcon(brand: string) {
  const b = brand.toLowerCase();
  if (b === "visa") return "💳";
  if (b === "mastercard") return "💳";
  if (b === "amex") return "💳";
  return "💳";
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  trialing: { label: "Trial", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30", dot: "bg-violet-400" },
  past_due: { label: "Past Due", cls: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-400" },
  canceled: { label: "Canceled", cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30", dot: "bg-zinc-500" },
  unpaid: { label: "Unpaid", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30", dot: "bg-orange-400" },
  paused: { label: "Paused", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30", dot: "bg-blue-400" },
  none: { label: "No Plan", cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30", dot: "bg-zinc-600" },
};

function getStatus(status: string | null | undefined) {
  return STATUS_CONFIG[status ?? "none"] ?? STATUS_CONFIG["none"];
}

const CANCEL_REASONS = [
  "Too expensive for my business",
  "Switching to a different software",
  "Not using it enough",
  "Missing a feature I need",
  "Technical issues",
  "Taking a break",
  "Other",
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BillingPage({ salonId }: { salonId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Plan switching state
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [showPlanConfirm, setShowPlanConfirm] = useState(false);

  // Cancellation flow state
  const [cancelStep, setCancelStep] = useState<"idle" | "reason" | "retention" | "confirm">("idle");
  const [cancelReason, setCancelReason] = useState("");

  const sessionStatus = searchParams.get("status");

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: billing, isLoading: billingLoading } = useQuery<BillingData>({
    queryKey: ["billing-profile", salonId],
    queryFn: () => apiFetch(`/api/billing/profile/${salonId}`),
  });

  const { data: invoicesData } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["billing-invoices", salonId],
    queryFn: () => apiFetch(`/api/billing/invoices/${salonId}`),
  });

  const { data: upcomingData } = useQuery<UpcomingInvoice | null>({
    queryKey: ["billing-upcoming", salonId],
    queryFn: () => apiFetch(`/api/billing/upcoming/${salonId}`),
    retry: false,
  });

  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: ["billing-payment-methods", salonId],
    queryFn: () => apiFetch(`/api/billing/payment-methods/${salonId}`),
    retry: false,
  });

  const { data: stripeStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["stripe-status"],
    queryFn: () => apiFetch("/api/billing/status"),
  });

  const { data: publicPlans } = useQuery<{ id: number; code: string; name: string; priceMonthly: number }[]>({
    queryKey: ["public-plans"],
    queryFn: () => apiFetch("/api/plans/public-plans"),
  });

  const { data: smsStatus, isLoading: smsLoading } = useQuery<{
    smsAllowance: number;
    smsCredits: number;
    smsCreditsTotalPurchased: number;
    planMonthlyAllowance: number;
    planName: string;
    packages: { id: string; priceCents: number; credits: number; label: string }[];
  }>({
    queryKey: ["sms-status", salonId],
    queryFn: () => apiFetch(`/api/billing/sms-status/${salonId}`),
  });

  const stripeConfigured = stripeStatus?.configured ?? false;

  // ── Mutations ────────────────────────────────────────────────────────────────

  const changePlanMutation = useMutation({
    mutationFn: (newPlanCode: string) =>
      apiFetch(`/api/billing/change-plan/${salonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlanCode, interval: "month" }),
      }),
    onSuccess: (_data, newPlanCode) => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", salonId] });
      queryClient.invalidateQueries({ queryKey: ["billing-upcoming", salonId] });
      queryClient.invalidateQueries({ queryKey: ["billing-invoices", salonId] });
      setShowPlanConfirm(false);
      setSwitchingTo(null);
      const newPlan = PLANS.find(p => p.code === newPlanCode) ?? PLANS[0];
      toast({ title: "Plan updated", description: `Switched to ${newPlan.name} — $${newPlan.price}/month.` });
    },
    onError: (err: any) =>
      toast({ title: "Could not switch plan", description: err.message, variant: "destructive" }),
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId }),
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/billing/cancel/${salonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeSubscriptionId: billing?.subscription?.stripeSubscriptionId,
          atPeriodEnd: true,
          reason: cancelReason,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", salonId] });
      setCancelStep("idle");
      toast({ title: "Cancellation scheduled", description: "Your subscription will end at the current billing period." });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/billing/resume/${salonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeSubscriptionId: billing?.subscription?.stripeSubscriptionId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", salonId] });
      toast({ title: "Subscription resumed", description: "Your cancellation has been reversed." });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const subscribeMutation = useMutation({
    mutationFn: (planCode: string) =>
      apiFetch(`/api/billing/subscribe/${salonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode, interval: "month" }),
      }),
    onSuccess: ({ url }: { url: string }) => { window.location.href = url; },
    onError: (err: any) =>
      toast({ title: "Could not start checkout", description: err.message, variant: "destructive" }),
  });

  const smsBucketMutation = useMutation({
    mutationFn: (packageId: string) =>
      apiFetch("/api/billing/sms-bucket/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, packageId }),
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const walletFundMutation = useMutation({
    mutationFn: (amountCents: number) =>
      apiFetch("/api/billing/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, amountCents }),
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const selectPlanMutation = useMutation({
    mutationFn: (planCode: string) => {
      const dbPlan = publicPlans?.find(p => p.code === planCode);
      if (!dbPlan) throw new Error("Plan not found");
      return apiFetch("/api/subscription/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: dbPlan.id, interval: "month" }),
      });
    },
    onSuccess: (_data, planCode) => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", salonId] });
      const plan = PLANS.find(p => p.code === planCode) ?? PLANS[0];
      toast({ title: "Plan selected", description: `Switched to ${plan.name}. Add Stripe keys to enable billing.` });
    },
    onError: (err: any) =>
      toast({ title: "Could not select plan", description: err.message, variant: "destructive" }),
  });

  const { data: walletData, isLoading: walletLoading } = useQuery<{
    balanceCents: number;
    transactions: {
      id: number;
      amount: number;
      transactionType: string;
      status: string;
      description: string | null;
      createdAt: string;
    }[];
  }>({
    queryKey: ["wallet-balance", salonId],
    queryFn: () => apiFetch(`/api/billing/wallet/balance/${salonId}`),
    refetchInterval: 30_000,
  });

  // ── Derived state ─────────────────────────────────────────────────────────────

  const sub = billing?.subscription;
  const profile = billing?.profile;
  const pm = billing?.paymentMethod ?? paymentMethods?.[0] ?? null;

  const subStatus = sub?.status ?? profile?.currentSubscriptionStatus;
  const statusCfg = getStatus(subStatus);

  const isScheduledToCancel = sub?.cancelAtPeriodEnd === 1 || sub?.cancelAtPeriodEnd === true;
  const isActive = subStatus === "active" || subStatus === "trialing";
  const isTrialing = subStatus === "trialing";
  const isPastDue = subStatus === "past_due";

  const periodEnd = (() => {
    if (!sub?.currentPeriodEnd) return null;
    const ms = Number(sub.currentPeriodEnd);
    if (isNaN(ms) || ms === 0) return null;
    return safeDate(ms > 1e10 ? ms : ms * 1000);
  })();

  const periodStart = (() => {
    if (!sub?.currentPeriodStart) return null;
    const ms = Number(sub.currentPeriodStart);
    if (isNaN(ms) || ms === 0) return null;
    return safeDate(ms > 1e10 ? ms : ms * 1000);
  })();

  const currentPlan = isActive
    ? PLANS.find(p => p.code === (billing?.plan?.code ?? sub?.planCode)) ?? null
    : null;

  if (billingLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin mx-auto" />
          <p className="text-zinc-500 text-sm">Loading billing information…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-20">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/manage")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Billing & Subscription</h1>
          <p className="text-zinc-500 text-xs mt-0.5">{billing?.store?.name}</p>
        </div>
        <div className="ml-auto">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* ── Session banners ───────────────────────────────────────────────────── */}
      {sessionStatus === "success" && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-300 text-sm font-medium">Subscription activated — welcome aboard!</span>
        </div>
      )}
      {!stripeConfigured && (
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 text-sm">Online payments are not yet enabled for this account. Add your Stripe keys in platform settings to activate subscriptions and top-ups.</span>
        </div>
      )}
      {isPastDue && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm font-medium">Your account has a past-due balance. Update your payment method to restore full access.</span>
          </div>
          {stripeConfigured && (
            <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white text-xs flex-shrink-0"
              onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
              {portalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update Payment"}
            </Button>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 1 — SUBSCRIPTION OVERVIEW HERO
      ───────────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800/60">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-transparent to-fuchsia-600/5 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">

            {/* Left — pricing */}
            <div className="space-y-4">
              <div>
                {currentPlan ? (
                  <>
                    <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">SalonOS {currentPlan.name}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-bold text-white tracking-tight">
                        ${currentPlan.price}
                      </span>
                      <span className="text-zinc-400 text-base mb-2">/ month</span>
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">{currentPlan.highlight}</p>
                  </>
                ) : (
                  <>
                    <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">Free Trial</p>
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-bold text-white tracking-tight">$0</span>
                      <span className="text-zinc-400 text-base mb-2">/ month</span>
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">Full access during your trial period</p>
                  </>
                )}
              </div>

              {isScheduledToCancel && periodEnd && (
                <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-lg px-3 py-2 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  Access ends {format(periodEnd, "MMMM d, yyyy")}
                </div>
              )}
              {isTrialing && (
                <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/25 text-violet-300 rounded-lg px-3 py-2 text-xs">
                  <Zap className="w-3.5 h-3.5" />
                  Free trial active
                  {periodEnd && ` — ends ${format(periodEnd, "MMM d")}`}
                </div>
              )}
            </div>

            {/* Right — details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:min-w-[180px]">
              {periodEnd && (
                <div className="sm:text-right">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">
                    {isScheduledToCancel ? "Access ends" : "Next billing"}
                  </p>
                  <p className="text-white font-semibold text-sm mt-0.5">
                    {format(periodEnd, "MMM d, yyyy")}
                  </p>
                </div>
              )}
              {periodStart && (
                <div className="sm:text-right">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Period start</p>
                  <p className="text-zinc-300 text-sm mt-0.5">{format(periodStart, "MMM d, yyyy")}</p>
                </div>
              )}
              {safeDate(profile?.subscriptionStartedAt) && (
                <div className="sm:text-right">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Member since</p>
                  <p className="text-zinc-300 text-sm mt-0.5">
                    {safeFormat(profile.subscriptionStartedAt, "MMM yyyy")}
                  </p>
                </div>
              )}
              <div className="sm:text-right">
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Annual estimate</p>
                <p className="text-zinc-300 text-sm mt-0.5">${(currentPlan?.price ?? 0) * 12}/year</p>
              </div>
            </div>
          </div>

          {/* Keep subscription button */}
          {isScheduledToCancel && stripeConfigured && (
            <div className="mt-5 pt-5 border-t border-zinc-700/50 flex items-center justify-between gap-3">
              <p className="text-zinc-400 text-sm">Changed your mind? Keep your subscription active.</p>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                {resumeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
                Keep subscription
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 2 — PLAN COMPARISON
      ───────────────────────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/70 border-zinc-700/50 overflow-hidden">
        <CardHeader className="pb-0 pt-5 px-6">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            Your Plan
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan != null && currentPlan.code === plan.code;
            const isElite = plan.code === "elite";
            return (
              <div
                key={plan.code}
                className={`rounded-xl border p-5 relative transition-all ${
                  isElite && isCurrent
                    ? "border-amber-500/70 bg-amber-500/[0.06] shadow-[0_0_24px_-4px_rgba(251,191,36,0.15)]"
                    : isElite
                    ? "border-amber-500/40 bg-amber-500/[0.04] hover:border-amber-400/60 shadow-[0_0_20px_-6px_rgba(251,191,36,0.12)]"
                    : isCurrent
                    ? "border-violet-500/60 bg-violet-500/[0.08]"
                    : "border-zinc-700/40 bg-zinc-800/30 hover:border-zinc-600/60"
                }`}
              >
                {isCurrent && !isElite && (
                  <span className="absolute -top-3 left-4 text-[10px] font-bold bg-violet-600 text-white px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Current
                  </span>
                )}
                {isElite && isCurrent && (
                  <span className="absolute -top-3 left-4 text-[10px] font-bold bg-amber-500 text-zinc-950 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Current
                  </span>
                )}
                {isElite && !isCurrent && (
                  <span className="absolute -top-3 left-4 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Highest Tier
                  </span>
                )}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className={`font-bold text-sm ${isElite ? "text-amber-100" : "text-white"}`}>{plan.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{plan.tagline}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-2xl font-bold ${isElite ? "text-amber-200" : "text-white"}`}>${plan.price}</span>
                    <span className="text-zinc-500 text-xs">/mo</span>
                  </div>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className={isElite ? "text-amber-400" : "text-emerald-400"}>✓</span> {f}
                    </li>
                  ))}
                  {(plan as any).notIncluded?.map((f: string) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-zinc-600 line-through">
                      <span className="text-zinc-600">✕</span> {f}
                    </li>
                  ))}
                </ul>
                {plan.apiDocs && (
                  <Link
                    to="/elite-api-docs"
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors mb-3"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    View API Integration Documentation →
                  </Link>
                )}
                {isElite && !isCurrent && (
                  <div className="space-y-2 mt-1">
                    <Link
                      to="/elite-details"
                      className="flex items-center justify-center gap-1.5 w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/50 text-amber-300 hover:text-amber-200 text-xs font-medium py-2 px-3 rounded-lg transition-all"
                    >
                      See Details <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                    {stripeConfigured ? (
                      isActive ? (
                        <Button size="sm" variant="outline"
                          className="w-full border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs"
                          onClick={() => { setSwitchingTo(plan.code); setShowPlanConfirm(true); }}>
                          Switch to Elite
                        </Button>
                      ) : (
                        <Button size="sm"
                          className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold"
                          onClick={() => subscribeMutation.mutate(plan.code)}
                          disabled={subscribeMutation.isPending}>
                          {subscribeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Subscribe — ${plan.price}/mo
                        </Button>
                      )
                    ) : (
                      <Button size="sm" variant="outline"
                        className="w-full border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs"
                        onClick={() => selectPlanMutation.mutate(plan.code)}
                        disabled={selectPlanMutation.isPending && switchingTo === plan.code}>
                        {selectPlanMutation.isPending && switchingTo === plan.code
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                        Select Elite Plan
                      </Button>
                    )}
                  </div>
                )}
                {!isElite && !isCurrent && stripeConfigured && isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-zinc-600/50 text-zinc-300 hover:bg-zinc-800 text-xs"
                    onClick={() => { setSwitchingTo(plan.code); setShowPlanConfirm(true); }}
                  >
                    Switch to {plan.name}
                  </Button>
                )}
                {!isElite && !isCurrent && stripeConfigured && !isActive && (
                  <Button
                    size="sm"
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                    onClick={() => subscribeMutation.mutate(plan.code)}
                    disabled={subscribeMutation.isPending}
                  >
                    {subscribeMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : null}
                    Subscribe — ${plan.price}/mo
                  </Button>
                )}
                {!isElite && !isCurrent && !stripeConfigured && (
                  <Button
                    size="sm"
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                    onClick={() => {
                      setSwitchingTo(plan.code);
                      selectPlanMutation.mutate(plan.code);
                    }}
                    disabled={selectPlanMutation.isPending}
                  >
                    {selectPlanMutation.isPending && switchingTo === plan.code ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : null}
                    Select {plan.name} — ${plan.price}/mo
                  </Button>
                )}
                {isCurrent && !isElite && (
                  <div className="flex items-center gap-1.5 text-xs text-violet-300">
                    <BadgeCheck className="w-3.5 h-3.5" /> Active plan
                  </div>
                )}
                {isCurrent && isElite && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-300">
                    <BadgeCheck className="w-3.5 h-3.5" /> Active plan
                  </div>
                )}
              </div>
            );
          })}

        </CardContent>
      </Card>

      {/* Plan switch confirm modal */}
      {showPlanConfirm && switchingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-2xl">
            <div>
              <h3 className="text-white font-bold text-lg">Switch plan?</h3>
              <p className="text-zinc-400 text-sm mt-1">
                You're switching to the{" "}
                <strong className="text-white">{PLANS.find(p => p.code === switchingTo)?.name}</strong>{" "}
                plan at ${PLANS.find(p => p.code === switchingTo)?.price}/month.
              </p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Current plan</span>
                <span className="text-white">{currentPlan ? `${currentPlan.name} — $${currentPlan.price}/mo` : "Free Trial"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">New plan</span>
                <span className="text-white font-bold">
                  {PLANS.find(p => p.code === switchingTo)?.name} — ${PLANS.find(p => p.code === switchingTo)?.price}/mo
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                className="border-zinc-600/50 text-zinc-300 hover:bg-zinc-800 flex-1"
                onClick={() => { setShowPlanConfirm(false); setSwitchingTo(null); }}>
                Cancel
              </Button>
              <Button size="sm"
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold"
                onClick={() => changePlanMutation.mutate(switchingTo)}
                disabled={changePlanMutation.isPending}>
                {changePlanMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Confirm switch
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          GRID — Billing Cycle + Payment Method
      ───────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* SECTION 3 — BILLING CYCLE */}
        <Card className="bg-zinc-900/70 border-zinc-700/50">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-400" />
              Billing Cycle
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {periodStart && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Cycle starts</span>
                <span className="text-white text-sm font-medium">{format(periodStart, "MMMM d, yyyy")}</span>
              </div>
            )}
            {periodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Cycle ends</span>
                <span className="text-white text-sm font-medium">{format(periodEnd, "MMMM d, yyyy")}</span>
              </div>
            )}
            {periodEnd && !isScheduledToCancel && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Next payment</span>
                <span className="text-violet-300 text-sm font-semibold">{format(periodEnd, "MMMM d, yyyy")}</span>
              </div>
            )}
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Billing interval</span>
              <span className="text-white text-sm font-medium capitalize">{sub?.interval ?? "Monthly"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Plan</span>
              <span className="text-white text-sm font-semibold">{currentPlan ? <>{currentPlan.name} — <span className="text-violet-300">${currentPlan.price}/mo</span></> : <span className="text-violet-300">Free Trial</span>}</span>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4 — PAYMENT METHOD */}
        <Card className="bg-zinc-900/70 border-zinc-700/50">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-violet-400" />
                Payment Method
              </CardTitle>
              {stripeConfigured && (
                <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white text-xs h-7 px-2"
                  onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                  {portalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Manage
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {pm ? (
              <>
                <div className="flex items-center gap-3 bg-zinc-800/40 rounded-xl p-4">
                  <div className="w-10 h-7 bg-zinc-700 rounded flex items-center justify-center text-sm">
                    {cardBrandIcon(pm.brand)}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold capitalize">
                      {pm.brand} •••• {pm.last4}
                    </p>
                    {pm.expMonth && pm.expYear && (
                      <p className="text-zinc-500 text-xs">Expires {pm.expMonth}/{String(pm.expYear).slice(-2)}</p>
                    )}
                  </div>
                  {(pm as any).isDefault && (
                    <span className="text-[10px] bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full">Default</span>
                  )}
                </div>
                {(pm as any).billingEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-xs">Billing email</span>
                    <span className="text-zinc-300 text-xs">{(pm as any).billingEmail}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 space-y-2">
                <CreditCard className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-zinc-500 text-sm">No payment method on file</p>
                {stripeConfigured && (
                  <Button size="sm" variant="outline" className="border-zinc-600/50 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => portalMutation.mutate()}>
                    Add payment method
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 5 — UPCOMING INVOICE PREVIEW
      ───────────────────────────────────────────────────────────────────────── */}
      {upcomingData && (
        <Card className="bg-zinc-900/70 border-zinc-700/50">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-400" />
              Upcoming Invoice
              {upcomingData.nextPaymentAttempt && (
                <span className="ml-auto text-zinc-500 text-xs font-normal">
                  Due {format(new Date(upcomingData.nextPaymentAttempt * 1000), "MMM d, yyyy")}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-2">
              {upcomingData.lines.slice(0, 5).map((line, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400 flex-1 pr-4 truncate">{line.description}</span>
                  <span className={`font-medium ${line.amountCents < 0 ? "text-emerald-400" : "text-white"}`}>
                    {line.amountCents < 0 ? "-" : ""}{fmtExact(Math.abs(line.amountCents))}
                  </span>
                </div>
              ))}
              <Separator className="bg-zinc-800 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-sm">Total due</span>
                <span className="text-white font-bold text-base">{fmtExact(upcomingData.amountDueCents)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 6 — BILLING HISTORY
      ───────────────────────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/70 border-zinc-700/50">
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-400" />
              Invoice History
            </CardTitle>
            <span className="text-zinc-500 text-xs">{invoicesData?.invoices?.length ?? 0} invoices</span>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!invoicesData?.invoices?.length ? (
            <div className="text-center py-10 px-5">
              <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No invoices yet</p>
              <p className="text-zinc-600 text-xs mt-1">Invoices will appear here after your first billing cycle</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-500 text-xs font-semibold px-5 py-2.5 uppercase tracking-wider">Invoice</th>
                    <th className="text-left text-zinc-500 text-xs font-semibold px-3 py-2.5 uppercase tracking-wider">Date</th>
                    <th className="text-right text-zinc-500 text-xs font-semibold px-3 py-2.5 uppercase tracking-wider">Amount</th>
                    <th className="text-center text-zinc-500 text-xs font-semibold px-3 py-2.5 uppercase tracking-wider">Status</th>
                    <th className="text-right text-zinc-500 text-xs font-semibold px-5 py-2.5 uppercase tracking-wider">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesData.invoices.map((inv) => {
                    const isPaid = inv.paid || inv.status === "paid";
                    return (
                      <tr key={inv.stripeInvoiceId} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="text-zinc-300 font-mono text-xs">
                            {inv.invoiceNumber ?? inv.stripeInvoiceId.slice(-8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-zinc-400">
                          {safeFormat(inv.createdAt, "MMM d, yyyy")}
                        </td>
                        <td className="px-3 py-3.5 text-right text-white font-semibold">
                          {fmtExact(inv.totalCents)}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              <BadgeCheck className="w-3 h-3" /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> {inv.status ?? "Unpaid"}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv.hostedInvoiceUrl && (
                              <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer"
                                className="text-zinc-400 hover:text-white transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {inv.invoicePdfUrl && (
                              <a href={inv.invoicePdfUrl} target="_blank" rel="noopener noreferrer"
                                className="text-zinc-400 hover:text-violet-400 transition-colors">
                                <Download className="w-3.5 h-3.5" />
                              </a>
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
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 7 — SUBSCRIPTION ACTIONS
      ───────────────────────────────────────────────────────────────────────── */}
      {stripeConfigured && isActive && !isScheduledToCancel && (
        <Card className="bg-zinc-900/70 border-zinc-700/50">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" />
              Subscription Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-2">
            <button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-700/40 hover:bg-zinc-800/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-zinc-400" />
                <div className="text-left">
                  <p className="text-white text-sm font-medium">Update payment method</p>
                  <p className="text-zinc-500 text-xs">Change your card or billing details</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </button>

            <button
              onClick={() => setCancelStep("reason")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-700/40 hover:bg-zinc-800/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <XCircle className="w-4 h-4 text-zinc-400" />
                <div className="text-left">
                  <p className="text-white text-sm font-medium">Cancel subscription</p>
                  <p className="text-zinc-500 text-xs">Access continues until end of billing period</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 8 — CANCELLATION FLOW
      ───────────────────────────────────────────────────────────────────────── */}
      {cancelStep !== "idle" && (
        <Card className="bg-zinc-900/70 border-zinc-700/50">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm">
                {cancelStep === "reason" && "Why are you leaving?"}
                {cancelStep === "retention" && "Before you go…"}
                {cancelStep === "confirm" && "Confirm cancellation"}
              </CardTitle>
              <button onClick={() => setCancelStep("idle")} className="text-zinc-500 hover:text-white transition-colors">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>

          <CardContent className="px-5 pb-5 space-y-4">
            {/* Step 1 — Reason */}
            {cancelStep === "reason" && (
              <>
                <p className="text-zinc-400 text-sm">This helps us improve. Your feedback matters.</p>
                <div className="space-y-2">
                  {CANCEL_REASONS.map((r) => (
                    <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${cancelReason === r ? "border-violet-500/50 bg-violet-500/8" : "border-zinc-700/40 hover:bg-zinc-800/30"}`}>
                      <input type="radio" name="cancel-reason" value={r} checked={cancelReason === r}
                        onChange={() => setCancelReason(r)} className="accent-violet-500" />
                      <span className="text-zinc-300 text-sm">{r}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-zinc-600/50 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => setCancelStep("idle")}>Back</Button>
                  <Button size="sm" className="ml-auto bg-zinc-700 hover:bg-zinc-600 text-white"
                    disabled={!cancelReason}
                    onClick={() => setCancelStep("retention")}>
                    Continue <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </>
            )}

            {/* Step 2 — Retention */}
            {cancelStep === "retention" && (
              <>
                <div className="space-y-3">
                  <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-4 space-y-2">
                    <p className="text-white font-semibold text-sm">Consider switching to a lower plan</p>
                    <p className="text-zinc-400 text-sm">
                      The Solo plan is just $9/month — perfect for independent stylists and booth renters.
                    </p>
                    {currentPlan?.code !== "solo" && (
                      <Button size="sm" variant="outline" className="border-zinc-600/50 text-zinc-300 hover:bg-zinc-800 mt-1"
                        onClick={() => { setSwitchingTo("solo"); setShowPlanConfirm(true); setCancelStep("idle"); }}>
                        Switch to Solo ($9/mo)
                      </Button>
                    )}
                  </div>
                  <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-4">
                    <p className="text-white font-semibold text-sm mb-1">Need help with something?</p>
                    <p className="text-zinc-400 text-sm">Our team can usually resolve most concerns quickly.</p>
                    <a href="mailto:support@certxa.com" className="text-violet-400 text-sm underline mt-1 inline-block">
                      Contact support →
                    </a>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-zinc-600/50 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => setCancelStep("reason")}>Back</Button>
                  <Button size="sm" className="ml-auto bg-zinc-700 hover:bg-zinc-600 text-white"
                    onClick={() => setCancelStep("confirm")}>
                    Still cancel <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </>
            )}

            {/* Step 3 — Confirm */}
            {cancelStep === "confirm" && (
              <>
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 space-y-2.5">
                  <p className="text-red-300 text-sm font-semibold">What happens when you cancel:</p>
                  <ul className="space-y-2">
                    {[
                      periodEnd && `Your subscription ends on ${format(periodEnd, "MMMM d, yyyy")}`,
                      "Staff accounts will lose platform access",
                      "Your data is retained for 30 days — reactivate anytime",
                      "No further charges will be made",
                    ].filter(Boolean).map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-zinc-400 text-sm">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-zinc-500 text-xs">
                  Reason: <span className="text-zinc-300">{cancelReason}</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-zinc-600/50 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => setCancelStep("retention")}>Back</Button>
                  <Button size="sm" variant="destructive" className="ml-auto"
                    onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                    {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                    Yes, cancel my subscription
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 9 — SMS CREDITS
      ───────────────────────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/70 border-zinc-700/50 overflow-hidden">
        <CardHeader className="pb-0 pt-5 px-6">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-violet-400" />
            SMS Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {smsLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading SMS status…
            </div>
          ) : (
            <>
              {/* Credit buckets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Subscription allowance */}
                <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-semibold">Monthly Allowance</p>
                      <p className="text-zinc-500 text-xs mt-0.5">Included with your plan · resets each cycle</p>
                    </div>
                    <span className="text-xs font-semibold text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                      {smsStatus?.planName ?? "Plan"}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-end justify-between mb-1.5">
                      <span className="text-2xl font-bold text-white">
                        {(smsStatus?.smsAllowance ?? 0).toLocaleString()}
                      </span>
                      <span className="text-zinc-500 text-xs">
                        of {(smsStatus?.planMonthlyAllowance ?? 0).toLocaleString()} remaining
                      </span>
                    </div>
                    {(smsStatus?.planMonthlyAllowance ?? 0) > 0 && (
                      <div className="w-full h-1.5 rounded-full bg-zinc-700/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all"
                          style={{
                            width: `${Math.min(100, ((smsStatus?.smsAllowance ?? 0) / (smsStatus?.planMonthlyAllowance ?? 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Purchased credits */}
                <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-semibold">Purchased Credits</p>
                      <p className="text-zinc-500 text-xs mt-0.5">One-time top-ups · never expire</p>
                    </div>
                    <ShoppingCart className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-white">
                      {(smsStatus?.smsCredits ?? 0).toLocaleString()}
                    </span>
                    {(smsStatus?.smsCreditsTotalPurchased ?? 0) > 0 && (
                      <p className="text-zinc-600 text-xs mt-1">
                        {(smsStatus?.smsCreditsTotalPurchased ?? 0).toLocaleString()} total purchased
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* How it works note */}
              <div className="flex items-start gap-2.5 bg-zinc-800/20 border border-zinc-700/30 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
                <p className="text-zinc-500 text-xs leading-relaxed">
                  Monthly allowance is used first. When depleted, purchased credits are drawn from automatically.
                  Allowance resets every billing cycle; purchased credits never expire.
                </p>
              </div>

              {/* Purchase packages */}
              {stripeConfigured && (
                <div className="space-y-3">
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Top Up Credits</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(smsStatus?.packages ?? [
                      { id: "10", priceCents: 1000, credits: 333, label: "$10 — 333 SMS" },
                      { id: "25", priceCents: 2500, credits: 833, label: "$25 — 833 SMS" },
                      { id: "50", priceCents: 5000, credits: 1666, label: "$50 — 1,666 SMS" },
                    ]).map((pkg) => (
                      <button
                        key={pkg.id}
                        onClick={() => smsBucketMutation.mutate(pkg.id)}
                        disabled={smsBucketMutation.isPending}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-700/40 bg-zinc-800/30 hover:border-violet-500/40 hover:bg-violet-500/[0.06] p-4 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {smsBucketMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                        ) : (
                          <span className="text-lg font-bold text-white group-hover:text-violet-200 transition-colors">
                            ${pkg.id}
                          </span>
                        )}
                        <span className="text-zinc-400 text-xs font-medium">
                          {pkg.credits.toLocaleString()} SMS
                        </span>
                        <span className="text-zinc-600 text-[10px]">
                          ~${(pkg.priceCents / 100 / pkg.credits * 1000).toFixed(1)}¢ / msg
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-zinc-600 text-[11px]">
                    Credits are added instantly after checkout.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 10 — ACCOUNT WALLET
      ───────────────────────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/70 border-zinc-700/50 overflow-hidden">
        <CardHeader className="pb-0 pt-5 px-6">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-violet-400" />
            Account Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {walletLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading wallet…
            </div>
          ) : (
            <>
              {/* Balance display */}
              <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-br from-violet-600/20 to-violet-500/10 border border-violet-500/25">
                <div>
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-1">Available Balance</p>
                  <p className="text-4xl font-bold text-white">
                    {fmtExact(walletData?.balanceCents ?? 0)}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">Used for platform services & AI features</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-violet-400" />
                </div>
              </div>

              {/* Top-up presets */}
              {stripeConfigured && (
                <div className="space-y-3">
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Add Funds</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[10, 25, 50, 100, 250].map((dollars) => (
                      <button
                        key={dollars}
                        onClick={() => walletFundMutation.mutate(dollars * 100)}
                        disabled={walletFundMutation.isPending}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-700/40 bg-zinc-800/30 hover:border-violet-500/40 hover:bg-violet-500/[0.06] p-3 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {walletFundMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                        ) : (
                          <span className="text-base font-bold text-white group-hover:text-violet-200 transition-colors">
                            ${dollars}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-zinc-600 text-[11px] flex items-center gap-1.5">
                    <Info className="w-3 h-3" />
                    Funds are available immediately after payment · secured by Stripe
                  </p>
                </div>
              )}

              {!stripeConfigured && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
                  <Info className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <p className="text-zinc-500 text-sm">Stripe is not configured — wallet funding is unavailable.</p>
                </div>
              )}

              {/* Transaction history */}
              {(walletData?.transactions ?? []).length > 0 && (
                <div className="space-y-3">
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Transaction History
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {(walletData?.transactions ?? []).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            tx.transactionType === "deposit" ? "bg-emerald-500/15" : "bg-red-500/15"
                          }`}>
                            {tx.transactionType === "deposit" ? (
                              <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-zinc-300 text-sm">{tx.description ?? tx.transactionType}</p>
                            <p className="text-zinc-600 text-xs">
                              {safeFormat(tx.createdAt, "MMM d, yyyy")}
                              {" · "}
                              <span className={`capitalize ${
                                tx.status === "completed" ? "text-emerald-500" :
                                tx.status === "failed" ? "text-red-500" : "text-amber-500"
                              }`}>{tx.status}</span>
                            </p>
                          </div>
                        </div>
                        <span className={`text-sm font-semibold ${
                          tx.transactionType === "deposit" ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {tx.transactionType === "deposit" ? "+" : "-"}{fmtExact(Math.abs(tx.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(walletData?.transactions ?? []).length === 0 && !walletLoading && (
                <div className="text-center py-6 text-zinc-600 text-sm">
                  No transactions yet · add funds to get started
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 11 — AUTO-REFILL
      ───────────────────────────────────────────────────────────────────────── */}
      <AutoRefillCard salonId={salonId} stripeConfigured={stripeConfigured} />

      {/* ─────────────────────────────────────────────────────────────────────────
          SECTION 12 — SUPPORT
      ───────────────────────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900/40 border-zinc-800/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
              <LifeBuoy className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Billing support</p>
              <p className="text-zinc-500 text-xs mt-0.5">Questions about your invoice or subscription? We're here to help.</p>
            </div>
            <a
              href="mailto:support@certxa.com"
              className="text-violet-400 hover:text-violet-300 text-sm font-medium flex items-center gap-1 transition-colors"
            >
              Contact <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
