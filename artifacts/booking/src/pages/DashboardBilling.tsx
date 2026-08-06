import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import {
  CreditCard, FileText, XCircle, CheckCircle, Clock, AlertTriangle,
  Download, Loader2, Zap, LifeBuoy, ChevronRight,
  Calendar, RefreshCw, ExternalLink, Info, BadgeCheck,
  MessageSquare, Phone, Shield, ToggleLeft, ToggleRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Plans ────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    code: "solo",
    name: "Solo",
    price: 9,
    tagline: "For independent stylists & booth renters",
    highlight: "1 calendar · 1 staff · 200 SMS/mo",
    features: ["1 calendar", "1 staff member", "Online booking page", "200 SMS/mo"],
    notIncluded: ["Payments & card reader"],
  },
  {
    code: "professional",
    name: "Professional",
    price: 22,
    tagline: "Everything you need, for any salon size",
    highlight: "Unlimited calendars · staff · payments · SMS",
    features: ["Unlimited calendars", "Unlimited staff", "Online booking page", "Payments & card reader", "Unlimited SMS", "Google Business Profile sync", "Advanced reporting", "Priority support"],
    notIncluded: [],
    popular: true,
  },
  {
    code: "elite",
    name: "Elite",
    price: 49,
    tagline: "Full API access for custom integrations",
    highlight: "50K SMS · Webhooks · API access · 99.9% SLA",
    features: ["Everything in Professional", "Unlimited API keys", "50,000 SMS credits/mo", "Webhooks & real-time events", "Priority support (4 h SLA)"],
    notIncluded: [],
  },
];

const CANCEL_REASONS = [
  "Too expensive for my business",
  "Switching to a different software",
  "Not using it enough",
  "Missing a feature I need",
  "Technical issues",
  "Taking a break",
  "Other",
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface BillingData {
  profile: any;
  subscription: any;
  plan: any;
  paymentMethod: { brand: string; last4: string; expMonth?: number; expYear?: number } | null;
  store: { id: number; name: string; email: string };
}

interface Invoice {
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
function parseDate(val: string | number | Date | null | undefined): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const n = Number(val);
  let d: Date;
  if (!isNaN(n) && String(val).trim() !== "") {
    d = new Date(n > 1e10 ? n : n * 1000);
  } else {
    d = new Date(val as string);
  }
  return isNaN(d.getTime()) ? null : d;
}

function safeFormat(val: string | number | Date | null | undefined, fmt: string, fallback = "—"): string {
  const d = parseDate(val);
  if (!d) return fallback;
  try { return format(d, fmt); } catch { return fallback; }
}

function fmtExact(cents: number | null | undefined): string {
  if (cents == null) return "$0.00";
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  active:   { label: "Active",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  trialing: { label: "Free Trial", cls: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  past_due: { label: "Past Due",  cls: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500" },
  canceled: { label: "Canceled",  cls: "bg-gray-100 text-gray-500 border-gray-200",         dot: "bg-gray-400" },
  unpaid:   { label: "Unpaid",    cls: "bg-orange-50 text-orange-700 border-orange-200",    dot: "bg-orange-500" },
  paused:   { label: "Paused",    cls: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-500" },
  none:     { label: "No Plan",   cls: "bg-gray-100 text-gray-500 border-gray-200",         dot: "bg-gray-400" },
};

function getStatus(status: string | null | undefined) {
  return STATUS_CONFIG[status ?? "none"] ?? STATUS_CONFIG["none"];
}

// ─── Small reusable pieces ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">{children}</p>;
}

function Divider() {
  return <div className="border-t border-gray-100" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardBilling() {
  const { selectedStore } = useSelectedStore();
  const salonId = selectedStore?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [showPlanConfirm, setShowPlanConfirm] = useState(false);
  const [selectingPlanCode, setSelectingPlanCode] = useState<string | null>(null);
  const [cancelStep, setCancelStep] = useState<"idle" | "reason" | "retention" | "confirm">("idle");
  const [cancelReason, setCancelReason] = useState("");

  // Auto top-up local form state (synced from query on load)
  const [arEnabled, setArEnabled] = useState(false);
  const [arThreshold, setArThreshold] = useState(5);
  const [arAmount, setArAmount] = useState(25);
  const [arDirty, setArDirty] = useState(false);

  const AR_THRESHOLDS = [3, 5, 10, 15, 20];
  const AR_AMOUNTS    = [10, 25, 50, 100, 250];

  const sessionStatus = searchParams.get("status");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: billing, isLoading: billingLoading } = useQuery<BillingData>({
    queryKey: ["billing-profile", salonId],
    queryFn: () => apiFetch(`/api/billing/profile/${salonId}`),
    enabled: !!salonId,
  });

  const { data: invoicesData } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["billing-invoices", salonId],
    queryFn: () => apiFetch(`/api/billing/invoices/${salonId}`),
    enabled: !!salonId,
  });

  const { data: upcomingData } = useQuery<UpcomingInvoice | null>({
    queryKey: ["billing-upcoming", salonId],
    queryFn: () => apiFetch(`/api/billing/upcoming/${salonId}`),
    enabled: !!salonId,
    retry: false,
  });

  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: ["billing-payment-methods", salonId],
    queryFn: () => apiFetch(`/api/billing/payment-methods/${salonId}`),
    enabled: !!salonId,
    retry: false,
  });

  const { data: walletBalance, isLoading: walletLoading, refetch: refetchWallet, isFetching: walletFetching } = useQuery<{
    balance: string;
    formatted: string;
  }>({
    queryKey: ["wallet-balance", salonId],
    queryFn: () => apiFetch(`/api/billing/credits/balance`),
    enabled: !!salonId,
    staleTime: 30_000,
  });

  const { data: smsStatus, isLoading: smsLoading } = useQuery<{
    smsAllowance: number;
    planMonthlyAllowance: number;
    planName: string;
  }>({
    queryKey: ["sms-status", salonId],
    queryFn: () => apiFetch(`/api/billing/sms-status/${salonId}`),
    enabled: !!salonId,
  });

  const { data: autoRefill } = useQuery<{
    enabled: boolean;
    threshold: number;
    amount: number;
    currentBalance: number;
    hasPaymentMethod: boolean;
    paymentMethod: { brand: string; last4: string } | null;
  }>({
    queryKey: ["auto-refill", salonId],
    queryFn: () => apiFetch(`/api/billing/auto-refill/${salonId}`),
    enabled: !!salonId,
  });

  const { data: publicPlans = [] } = useQuery<{ id: number; code: string; name: string }[]>({
    queryKey: ["public-plans-db"],
    queryFn: () => apiFetch("/api/plans/public-plans"),
  });

  // Sync auto-refill settings from server into local form state (once on load)
  useEffect(() => {
    if (!autoRefill) return;
    setArEnabled(autoRefill.enabled);
    setArThreshold(autoRefill.threshold);
    setArAmount(autoRefill.amount);
    setArDirty(false);
  }, [autoRefill]);

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

  const selectPlanMutation = useMutation({
    mutationFn: async (planCode: string) => {
      const dbPlan = publicPlans.find((p) => p.code === planCode);
      if (!dbPlan) throw new Error("Plan not found — please refresh and try again.");
      return apiFetch("/api/subscription/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: dbPlan.id }),
      });
    },
    onMutate: (planCode) => setSelectingPlanCode(planCode),
    onSettled: () => setSelectingPlanCode(null),
    onSuccess: (data, planCode) => {
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["billing-profile", salonId] });
      const plan = PLANS.find((p) => p.code === planCode) ?? PLANS[0];
      toast({ title: "Plan selected", description: `You're now on the ${plan.name} plan — $${plan.price}/mo.` });
    },
    onError: (err: any) =>
      toast({ title: "Could not select plan", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/billing/cancel/${salonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atPeriodEnd: true, reason: cancelReason }),
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
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", salonId] });
      toast({ title: "Subscription resumed", description: "Your cancellation has been reversed." });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const saveAutoRefillMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/billing/auto-refill/${salonId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: arEnabled, threshold: arThreshold, amount: arAmount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-refill", salonId] });
      setArDirty(false);
      toast({ title: "Auto top-up saved", description: arEnabled ? `Will top up $${arAmount} when balance drops below $${arThreshold}.` : "Auto top-up disabled." });
    },
    onError: (err: any) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const setupPmMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/billing/auto-refill/setup-pm/${salonId}`, { method: "POST" }),
    onSuccess: (data: { url: string }) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) =>
      toast({ title: "Could not start setup", description: err.message, variant: "destructive" }),
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
  const hasNoPlan = !subStatus || subStatus === "none";
  const periodEnd = parseDate(sub?.currentPeriodEnd);
  const periodStart = parseDate(sub?.currentPeriodStart);
  const currentPlan = PLANS.find(p => p.code === (billing?.plan?.code ?? sub?.planCode)) ?? null;
  const walletAmt = parseFloat(walletBalance?.balance ?? "0");

  const trialDaysLeft = isTrialing && periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const trialIsUrgent = trialDaysLeft !== null && trialDaysLeft <= 3;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-24">

        {/* ── Page header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Billing & Plan</h1>
            <p className="text-sm text-gray-400 mt-0.5">{billing?.store?.name ?? selectedStore?.name}</p>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
            statusCfg.cls
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
            {statusCfg.label}
          </span>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────────────── */}
        {billingLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        )}

        {!billingLoading && (
          <>
            {/* ── Banners ───────────────────────────────────────────────────────── */}
            {sessionStatus === "success" && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span className="text-emerald-800 text-sm font-semibold">Subscription activated — welcome aboard! 🎉</span>
              </div>
            )}
            {isPastDue && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-red-800 text-sm font-semibold">Payment past due</p>
                  <p className="text-red-500 text-xs mt-0.5">Update your payment method to restore full access.</p>
                </div>
              </div>
            )}

            {/* ── Free trial countdown banner ────────────────────────────────────── */}
            {isTrialing && trialDaysLeft !== null && (
              <div className={cn(
                "rounded-2xl border p-4 flex items-center gap-4",
                trialIsUrgent
                  ? "bg-red-50 border-red-200"
                  : "bg-violet-50 border-violet-200"
              )}>
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-center",
                  trialIsUrgent ? "bg-red-100" : "bg-violet-100"
                )}>
                  <div>
                    <p className={cn("text-xl font-black leading-none", trialIsUrgent ? "text-red-600" : "text-violet-700")}>
                      {trialDaysLeft}
                    </p>
                    <p className={cn("text-[9px] font-semibold uppercase tracking-wide", trialIsUrgent ? "text-red-400" : "text-violet-400")}>
                      {trialDaysLeft === 1 ? "day" : "days"}
                    </p>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-bold", trialIsUrgent ? "text-red-800" : "text-violet-800")}>
                    {trialDaysLeft === 0
                      ? "Your free trial ends today"
                      : trialDaysLeft === 1
                      ? "Your free trial ends tomorrow"
                      : `${trialDaysLeft} days left in your free trial`}
                  </p>
                  <p className={cn("text-xs mt-0.5", trialIsUrgent ? "text-red-500" : "text-violet-500")}>
                    {periodEnd ? `Trial expires ${format(periodEnd, "MMMM d, yyyy")}` : "Choose a plan to keep your data and features."}
                    {trialIsUrgent ? " — pick a plan to keep access." : ""}
                  </p>
                </div>
                <a
                  href="#plans-section"
                  onClick={(e) => { e.preventDefault(); document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" }); }}
                  className={cn(
                    "flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors whitespace-nowrap",
                    trialIsUrgent
                      ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                      : "bg-violet-600 text-white border-violet-600 hover:bg-violet-700"
                  )}
                >
                  Choose a plan
                </a>
              </div>
            )}

            {/* ── Current plan ─────────────────────────────────────────────────── */}
            <div>
              <SectionLabel>Your Plan</SectionLabel>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-base">
                        {currentPlan ? `${currentPlan.name} — $${currentPlan.price}/mo` : isTrialing ? "Free Trial" : "No active plan"}
                      </p>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {currentPlan?.highlight ?? (isTrialing ? "Full access during your trial" : "Choose a plan to unlock all features")}
                    </p>
                  </div>
                </div>

                {/* Key dates row */}
                {(periodEnd || periodStart || profile?.subscriptionStartedAt) && (
                  <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {periodEnd && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          {isScheduledToCancel ? "Access ends" : isTrialing ? "Trial ends" : "Next billing"}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">{format(periodEnd, "MMM d, yyyy")}</p>
                        {isTrialing && trialDaysLeft !== null && (
                          <span className={cn(
                            "inline-flex items-center gap-0.5 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            trialIsUrgent
                              ? "bg-red-100 text-red-600"
                              : "bg-violet-100 text-violet-600"
                          )}>
                            <Clock className="w-2.5 h-2.5" />
                            {trialDaysLeft === 0 ? "Ends today" : trialDaysLeft === 1 ? "1 day left" : `${trialDaysLeft} days left`}
                          </span>
                        )}
                      </div>
                    )}
                    {periodStart && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Period start</p>
                        <p className="text-sm text-gray-600 mt-0.5">{format(periodStart, "MMM d, yyyy")}</p>
                      </div>
                    )}
                    {profile?.subscriptionStartedAt && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Member since</p>
                        <p className="text-sm text-gray-600 mt-0.5">{safeFormat(profile.subscriptionStartedAt, "MMM yyyy")}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Scheduled cancel notice */}
                {isScheduledToCancel && periodEnd && (
                  <div className="border-t border-amber-100 bg-amber-50 px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-700">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium">Cancels {format(periodEnd, "MMMM d, yyyy")} — you still have full access until then</span>
                    </div>
                    <button
                      onClick={() => resumeMutation.mutate()}
                      disabled={resumeMutation.isPending}
                      className="text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {resumeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Keep plan"}
                    </button>
                  </div>
                )}

                {/* CTA footer */}
                <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/60 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    {sub?.interval ? `Billed ${sub.interval}ly` : "Monthly billing"}
                  </p>
                  <Link
                    to="#plans"
                    onClick={(e) => { e.preventDefault(); document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" }); }}
                    className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                  >
                    {hasNoPlan || isTrialing ? "Choose a plan" : "Change plan"}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ── Plan picker ──────────────────────────────────────────────────── */}
            <div id="plans-section">
              <SectionLabel>Available Plans</SectionLabel>
              <div className="space-y-3">
                {PLANS.map((plan) => {
                  const isCurrent = currentPlan != null && currentPlan.code === plan.code;
                  const isElite = plan.code === "elite";
                  return (
                    <div
                      key={plan.code}
                      className={cn(
                        "rounded-2xl border p-5 transition-all relative",
                        isCurrent
                          ? isElite ? "border-amber-300 bg-amber-50/60" : "border-primary/30 bg-primary/4"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      )}
                    >
                      {(plan as any).popular && !isCurrent && (
                        <span className="absolute -top-3 left-5 text-[10px] font-bold bg-primary text-white px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Most popular
                        </span>
                      )}
                      {isCurrent && (
                        <span className={cn(
                          "absolute -top-3 left-5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                          isElite ? "bg-amber-500 text-white" : "bg-primary text-white"
                        )}>
                          Current plan
                        </span>
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className={cn("text-xl font-bold", isElite ? "text-amber-800" : "text-gray-900")}>
                              ${plan.price}
                            </span>
                            <span className="text-gray-400 text-xs">/mo</span>
                            <span className={cn("ml-2 font-semibold text-sm", isElite ? "text-amber-700" : "text-gray-800")}>{plan.name}</span>
                          </div>
                          <p className="text-gray-400 text-xs mt-1">{plan.highlight}</p>
                        </div>
                        <div className="flex-shrink-0">
                          {isCurrent ? (
                            <div className={cn("flex items-center gap-1.5 text-xs font-semibold", isElite ? "text-amber-600" : "text-primary")}>
                              <BadgeCheck className="w-4 h-4" /> Active
                            </div>
                          ) : isActive ? (
                            <button
                              onClick={() => { setSwitchingTo(plan.code); setShowPlanConfirm(true); }}
                              disabled={changePlanMutation.isPending && switchingTo === plan.code}
                              className={cn(
                                "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1",
                                isElite
                                  ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                                  : "text-gray-700 bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300"
                              )}
                            >
                              {changePlanMutation.isPending && switchingTo === plan.code
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : null}
                              Switch
                            </button>
                          ) : (
                            <button
                              onClick={() => selectPlanMutation.mutate(plan.code)}
                              disabled={selectingPlanCode === plan.code}
                              className={cn(
                                "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1",
                                isElite
                                  ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                                  : "text-primary bg-primary/8 hover:bg-primary/15 border-primary/20"
                              )}
                            >
                              {selectingPlanCode === plan.code
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Zap className="w-3 h-3" />}
                              Select {plan.name}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Feature pills */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {plan.features.slice(0, 4).map((f) => (
                          <span key={f} className={cn(
                            "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                            isElite && isCurrent
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : isCurrent
                              ? "bg-primary/8 text-primary border-primary/20"
                              : "bg-gray-50 text-gray-500 border-gray-200"
                          )}>
                            {f}
                          </span>
                        ))}
                        {plan.features.length > 4 && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-400 border-gray-200">
                            +{plan.features.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Plan switch confirmation modal ───────────────────────────────── */}
            {showPlanConfirm && switchingTo && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-xl">
                  <div>
                    <h3 className="text-gray-900 font-bold text-lg">Switch to {PLANS.find(p => p.code === switchingTo)?.name}?</h3>
                    <p className="text-gray-500 text-sm mt-1">Your billing will be updated immediately and prorated.</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">From</span>
                      <span className="text-gray-700">{currentPlan?.name ?? "Free Trial"} — ${currentPlan?.price ?? 0}/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">To</span>
                      <span className="text-gray-900 font-bold">
                        {PLANS.find(p => p.code === switchingTo)?.name} — ${PLANS.find(p => p.code === switchingTo)?.price}/mo
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      onClick={() => { setShowPlanConfirm(false); setSwitchingTo(null); }}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      onClick={() => changePlanMutation.mutate(switchingTo)}
                      disabled={changePlanMutation.isPending}
                    >
                      {changePlanMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirm switch
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Payment method + Billing cycle ───────────────────────────────── */}
            <div>
              <SectionLabel>Payment</SectionLabel>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100 overflow-hidden">

                {/* Card on file */}
                <div className="p-5">
                  <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Card on file
                  </p>
                  {pm ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-7 bg-gray-50 border border-gray-200 rounded-md flex items-center justify-center text-base shadow-sm">
                        💳
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 capitalize">
                          {pm.brand} •••• {pm.last4}
                        </p>
                        {pm.expMonth && pm.expYear && (
                          <p className="text-xs text-gray-400">Expires {pm.expMonth}/{String(pm.expYear).slice(-2)}</p>
                        )}
                      </div>
                      {(pm as any).isDefault && (
                        <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">Default</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-gray-400">
                      <CreditCard className="w-5 h-5 text-gray-200" />
                      <span className="text-sm">No payment method on file</span>
                    </div>
                  )}
                </div>

                {/* Billing cycle */}
                {(periodStart || periodEnd) && (
                  <div className="p-5">
                    <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Billing cycle
                    </p>
                    <div className="space-y-2.5">
                      {periodStart && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Cycle start</span>
                          <span className="text-gray-700 font-medium">{format(periodStart, "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {periodEnd && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{isScheduledToCancel ? "Access ends" : "Next payment"}</span>
                          <span className={cn("font-semibold", isScheduledToCancel ? "text-amber-600" : "text-primary")}>
                            {format(periodEnd, "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Billing interval</span>
                        <span className="text-gray-700 capitalize">{sub?.interval ?? "Monthly"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Upcoming invoice ─────────────────────────────────────────────── */}
            {upcomingData && (
              <div>
                <SectionLabel>Upcoming Invoice</SectionLabel>
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="p-5 space-y-2.5">
                    {upcomingData.lines.slice(0, 5).map((line, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex-1 pr-4 truncate">{line.description}</span>
                        <span className={cn("font-medium", line.amountCents < 0 ? "text-emerald-600" : "text-gray-900")}>
                          {line.amountCents < 0 ? "-" : ""}{fmtExact(Math.abs(line.amountCents))}
                        </span>
                      </div>
                    ))}
                    <Divider />
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900 font-semibold text-sm">Total due</span>
                      <span className="text-gray-900 font-bold text-base">{fmtExact(upcomingData.amountDueCents)}</span>
                    </div>
                  </div>
                  {upcomingData.nextPaymentAttempt && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3">
                      <p className="text-xs text-gray-400">
                        Due {safeFormat(upcomingData.nextPaymentAttempt, "MMMM d, yyyy")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Invoice history ──────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Invoice History</SectionLabel>
                {(invoicesData?.invoices?.length ?? 0) > 0 && (
                  <span className="text-[11px] text-gray-400 font-medium -mt-3">
                    {invoicesData!.invoices.length} invoice{invoicesData!.invoices.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {!invoicesData?.invoices?.length ? (
                  <div className="text-center py-12 px-6">
                    <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm font-medium">No invoices yet</p>
                    <p className="text-gray-300 text-xs mt-1">Invoices appear here after your first billing cycle</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-5 py-3">Invoice</th>
                          <th className="text-left text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-3 py-3">Date</th>
                          <th className="text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-3 py-3">Amount</th>
                          <th className="text-center text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-3 py-3">Status</th>
                          <th className="text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-5 py-3">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {invoicesData.invoices.map((inv) => {
                          const isPaid = inv.paid || inv.status === "paid";
                          return (
                            <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                              <td className="px-5 py-3.5">
                                <span className="text-gray-500 font-mono text-xs">{inv.invoiceNumber ?? `#${inv.id}`}</span>
                              </td>
                              <td className="px-3 py-3.5 text-gray-400 text-xs">{safeFormat(inv.createdAt, "MMM d, yyyy")}</td>
                              <td className="px-3 py-3.5 text-right text-gray-900 font-semibold text-sm">{fmtExact(inv.totalCents)}</td>
                              <td className="px-3 py-3.5 text-center">
                                {isPaid ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 text-[10px] font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                    <BadgeCheck className="w-3 h-3" /> Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-700 text-[10px] font-semibold bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                    <AlertTriangle className="w-3 h-3" /> {inv.status ?? "Unpaid"}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-end gap-2">
                                  {inv.hostedInvoiceUrl && (
                                    <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-gray-600 transition-colors" title="View invoice">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {inv.invoicePdfUrl && (
                                    <a href={inv.invoicePdfUrl} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-primary transition-colors" title="Download PDF">
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
              </div>
            </div>

            {/* ── SMS allowance ────────────────────────────────────────────────── */}
            <div>
              <SectionLabel>SMS Allowance</SectionLabel>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {smsLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm p-5">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <>
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">Monthly allowance</p>
                        <span className="text-[10px] font-semibold text-primary bg-primary/8 border border-primary/15 px-2 py-0.5 rounded-full">
                          {smsStatus?.planName ?? "Plan"}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="text-3xl font-bold text-gray-900">
                            {(smsStatus?.smsAllowance ?? 0).toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-400">
                            of {(smsStatus?.planMonthlyAllowance ?? 0).toLocaleString()} remaining
                          </span>
                        </div>
                        {(smsStatus?.planMonthlyAllowance ?? 0) > 0 && (
                          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                (smsStatus?.smsAllowance ?? 0) === 0 ? "bg-red-400" :
                                ((smsStatus?.smsAllowance ?? 0) / (smsStatus?.planMonthlyAllowance ?? 1)) < 0.2 ? "bg-amber-400" :
                                "bg-primary"
                              )}
                              style={{ width: `${Math.min(100, ((smsStatus?.smsAllowance ?? 0) / (smsStatus?.planMonthlyAllowance ?? 1)) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">Resets at the start of each billing cycle</p>
                    </div>

                  </>
                )}
              </div>
            </div>

            {/* ── Account balance / wallet ──────────────────────────────────────── */}
            <div>
              <SectionLabel>Wallet Balance</SectionLabel>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

                {/* Balance row */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Powers AI Receptionist calls & pay-as-you-go SMS</p>
                      {walletLoading ? (
                        <div className="h-10 w-28 rounded-lg bg-gray-100 animate-pulse" />
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "text-4xl font-bold tracking-tight",
                            walletAmt < 0 ? "text-red-500" : walletAmt < 5 ? "text-amber-500" : "text-gray-900"
                          )}>
                            {walletBalance?.formatted ?? "$0.00"}
                          </span>
                          {walletAmt < 5 && walletAmt >= 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Low
                            </span>
                          )}
                          {walletAmt < 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Negative
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => refetchWallet()}
                        disabled={walletFetching}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Refresh balance"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", walletFetching && "animate-spin")} />
                      </button>
                      <Link
                        to="/manage/billing/credits-topup"
                        className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" /> Top Up
                      </Link>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-violet-100 text-violet-600">
                      <Phone className="w-3 h-3" /> AI Receptionist
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-sky-100 text-sky-600">
                      <MessageSquare className="w-3 h-3" /> Pay-as-you-go SMS
                    </span>
                  </div>
                </div>

                {/* Auto top-up */}
                <div className="border-t border-gray-100">
                  {/* Toggle header */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors"
                    onClick={() => {
                      setArEnabled(prev => !prev);
                      setArDirty(true);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                        arEnabled ? "bg-violet-100" : "bg-gray-100"
                      )}>
                        <Zap className={cn("w-4 h-4", arEnabled ? "text-violet-600" : "text-gray-400")} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-800">Auto top-up</p>
                        <p className="text-xs text-gray-400">
                          {arEnabled ? `Tops up $${arAmount} when balance drops below $${arThreshold}` : "Automatically refill your wallet when balance gets low"}
                        </p>
                      </div>
                    </div>
                    {arEnabled
                      ? <ToggleRight className="w-8 h-8 text-violet-600 flex-shrink-0" />
                      : <ToggleLeft className="w-8 h-8 text-gray-300 flex-shrink-0" />
                    }
                  </button>

                  {/* Settings (shown when enabled) */}
                  {arEnabled && (
                    <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">

                      {/* Payment method */}
                      {autoRefill && !autoRefill.hasPaymentMethod && (
                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-amber-700">No payment method saved</p>
                            <p className="text-xs text-amber-600 mt-0.5">Auto top-up needs a saved card to charge automatically.</p>
                          </div>
                          <button
                            onClick={() => setupPmMutation.mutate()}
                            disabled={setupPmMutation.isPending}
                            className="text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
                          >
                            {setupPmMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                            Add card
                          </button>
                        </div>
                      )}

                      {autoRefill?.hasPaymentMethod && autoRefill.paymentMethod && (
                        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <CreditCard className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <p className="text-xs text-gray-600 flex-1">
                            Charges to <span className="font-semibold capitalize">{autoRefill.paymentMethod.brand}</span> •••• {autoRefill.paymentMethod.last4}
                          </p>
                          <button
                            onClick={() => setupPmMutation.mutate()}
                            disabled={setupPmMutation.isPending}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Change
                          </button>
                        </div>
                      )}

                      {/* Threshold picker */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Top up when balance drops below</p>
                        <div className="flex gap-2 flex-wrap">
                          {AR_THRESHOLDS.map(t => (
                            <button
                              key={t}
                              onClick={() => { setArThreshold(t); setArDirty(true); }}
                              className={cn(
                                "px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all",
                                arThreshold === t
                                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                              )}
                            >
                              ${t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Amount picker */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Top up amount</p>
                        <div className="flex gap-2 flex-wrap">
                          {AR_AMOUNTS.map(a => (
                            <button
                              key={a}
                              onClick={() => { setArAmount(a); setArDirty(true); }}
                              className={cn(
                                "px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all",
                                arAmount === a
                                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                              )}
                            >
                              ${a}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Summary line */}
                      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                        When your balance drops below <strong className="text-gray-600">${arThreshold}</strong>, we'll automatically charge your saved card <strong className="text-gray-600">${arAmount}</strong> to keep things running.
                      </p>

                      {/* Save button */}
                      {arDirty && (
                        <button
                          onClick={() => saveAutoRefillMutation.mutate()}
                          disabled={saveAutoRefillMutation.isPending}
                          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                        >
                          {saveAutoRefillMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Save auto top-up settings
                        </button>
                      )}
                    </div>
                  )}

                  {/* Disabled state — show save if toggled off and dirty */}
                  {!arEnabled && arDirty && (
                    <div className="px-5 pb-5">
                      <button
                        onClick={() => saveAutoRefillMutation.mutate()}
                        disabled={saveAutoRefillMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                      >
                        {saveAutoRefillMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save — disable auto top-up
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 flex items-center justify-between">
                  <p className="text-xs text-gray-400">Shared between AI calls and SMS</p>
                  <Link to="/manage/billing/credits-topup" className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors">
                    View history <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ── Cancel subscription ──────────────────────────────────────────── */}
            {isActive && !isScheduledToCancel && cancelStep === "idle" && (
              <div>
                <SectionLabel>Manage</SectionLabel>
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <button
                    onClick={() => setCancelStep("reason")}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gray-100 group-hover:bg-red-50 flex items-center justify-center flex-shrink-0 transition-colors">
                        <Shield className="w-4 h-4 text-gray-400 group-hover:text-red-400 transition-colors" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-800">Cancel subscription</p>
                        <p className="text-xs text-gray-400">You keep full access until the end of your billing period</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Cancellation flow ─────────────────────────────────────────────── */}
            {cancelStep !== "idle" && (
              <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-900">
                    {cancelStep === "reason" && "Why are you leaving?"}
                    {cancelStep === "retention" && "Before you go…"}
                    {cancelStep === "confirm" && "Confirm cancellation"}
                  </p>
                  <button onClick={() => setCancelStep("idle")} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {cancelStep === "reason" && (
                    <>
                      <p className="text-gray-500 text-sm">Your feedback helps us improve.</p>
                      <div className="space-y-2">
                        {CANCEL_REASONS.map((r) => (
                          <label key={r} className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                            cancelReason === r ? "border-primary/40 bg-primary/4" : "border-gray-200 hover:bg-gray-50"
                          )}>
                            <input type="radio" name="cancel-reason" value={r} checked={cancelReason === r}
                              onChange={() => setCancelReason(r)} className="accent-primary" />
                            <span className="text-gray-700 text-sm">{r}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                          onClick={() => setCancelStep("idle")}>Back</button>
                        <button className="ml-auto px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold transition-colors flex items-center gap-1.5"
                          disabled={!cancelReason} onClick={() => setCancelStep("retention")}>
                          Continue <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}

                  {cancelStep === "retention" && (
                    <>
                      <div className="space-y-3">
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <p className="text-gray-900 font-semibold text-sm">Try our Solo plan instead</p>
                          <p className="text-gray-500 text-sm mt-1">Just $9/month — perfect for independent stylists and booth renters.</p>
                          {(currentPlan?.code ?? "") !== "solo" && (
                            <button className="mt-3 text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                              onClick={() => { setSwitchingTo("solo"); setShowPlanConfirm(true); setCancelStep("idle"); }}>
                              Switch to Solo ($9/mo)
                            </button>
                          )}
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <p className="text-gray-900 font-semibold text-sm">Need help with something?</p>
                          <p className="text-gray-500 text-sm mt-1">Our team can usually resolve issues quickly.</p>
                          <a href="mailto:support@certxa.com" className="text-primary text-sm font-medium underline mt-2 inline-block">Contact support →</a>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                          onClick={() => setCancelStep("reason")}>Back</button>
                        <button className="ml-auto px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold transition-colors flex items-center gap-1.5"
                          onClick={() => setCancelStep("confirm")}>
                          Still cancel <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}

                  {cancelStep === "confirm" && (
                    <>
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2.5">
                        <p className="text-red-700 text-sm font-semibold">What happens when you cancel</p>
                        <ul className="space-y-2">
                          {[
                            periodEnd && `Subscription ends ${format(periodEnd, "MMMM d, yyyy")}`,
                            "Staff accounts will lose platform access",
                            "Your data is retained for 30 days — reactivate anytime",
                            "No further charges after cancellation",
                          ].filter(Boolean).map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-600 text-sm">
                              <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-gray-400 text-xs">Reason: <span className="text-gray-600">{cancelReason}</span></p>
                      <div className="flex gap-2">
                        <button className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                          onClick={() => setCancelStep("retention")}>Back</button>
                        <button
                          className="ml-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors flex items-center gap-1.5"
                          onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}
                        >
                          {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          Yes, cancel my subscription
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Support ───────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                <LifeBuoy className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Billing support</p>
                <p className="text-xs text-gray-400 mt-0.5">Questions about your invoice or subscription? We're here.</p>
              </div>
              <a
                href="mailto:support@certxa.com"
                className="text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                Contact <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>

          </>
        )}
      </div>
    </AppLayout>
  );
}
