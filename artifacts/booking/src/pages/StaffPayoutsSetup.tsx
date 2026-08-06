import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import { ConnectComponentsProvider, ConnectAccountOnboarding } from "@stripe/react-connect-js";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft, CheckCircle2, Clock, AlertCircle, XCircle,
  Zap, Shield, CreditCard, RefreshCw, ExternalLink, Loader2, LayoutDashboard, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StripeStatus = {
  hasContractorRecord: boolean;
  contractorId?: number;
  onboardingStatus?: string;
  bankVerified?: boolean;
  hasStripeAccount?: boolean;
  stripeConfigured?: boolean;
};

type SessionData = {
  clientSecret: string;
  publishableKey: string;
  contractorId: number;
  onboardingStatus: string;
  bankVerified: boolean;
};

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  complete:    { label: "Verified",       color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  in_progress: { label: "In progress",    color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     icon: Clock        },
  restricted:  { label: "Restricted",     color: "text-red-700",     bg: "bg-red-50 border-red-200",         icon: XCircle      },
  pending:     { label: "Not set up",     color: "text-gray-500",    bg: "bg-gray-50 border-gray-200",       icon: AlertCircle  },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function StaffPayoutsSetup() {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const qc          = useQueryClient();

  // Whether the embedded component is currently mounted
  const [showEmbedded, setShowEmbedded] = useState(false);
  // Holds the Stripe Connect instance once the session is fetched
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  // Fallback redirect URL returned by the legacy endpoint when embedded fails
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  // ── Fetch current status ──────────────────────────────────────────────────
  const { data: status, isLoading } = useQuery<StripeStatus>({
    queryKey: ["/api/staff/me/stripe-status"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/stripe-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
  });

  // ── Fetch onboarding session + initialize Stripe Connect ─────────────────
  const startEmbedded = useMutation({
    mutationFn: async (): Promise<SessionData> => {
      const res = await fetch("/api/staff/me/stripe-connect-session", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start onboarding");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const instance = loadConnectAndInitialize({
        publishableKey: data.publishableKey,
        fetchClientSecret: async () => data.clientSecret,
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary:    "#0d9488", // teal-600
            fontFamily:      "Inter, system-ui, sans-serif",
            borderRadius:    "12px",
            spacingUnit:     "10px",
          },
        },
      });
      setConnectInstance(instance);
      setShowEmbedded(true);
      qc.invalidateQueries({ queryKey: ["/api/staff/me/stripe-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not start onboarding", description: err.message, variant: "destructive" });
    },
  });

  // ── Fallback: get a redirect URL via the legacy endpoint ─────────────────
  const getRedirectLink = useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      if (!status?.contractorId) throw new Error("No contractor ID");
      const res = await fetch(`/api/contractor-payouts/contractors/${status.contractorId}/onboarding-link`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to get link");
      }
      return res.json();
    },
    onSuccess: (data) => setFallbackUrl(data.url),
    onError: (err: Error) => toast({ title: "Could not get link", description: err.message, variant: "destructive" }),
  });

  // ── Sync status from Stripe ───────────────────────────────────────────────
  const syncStatus = useMutation({
    mutationFn: async () => {
      if (!status?.contractorId) throw new Error("No contractor");
      const res = await fetch(`/api/contractor-payouts/contractors/${status.contractorId}/sync-stripe`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff/me/stripe-status"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  // ── Handle embedded component exit ───────────────────────────────────────
  function handleOnboardingExit() {
    setShowEmbedded(false);
    setConnectInstance(null);
    syncStatus.mutate();
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const statusKey   = status?.onboardingStatus ?? "pending";
  const statusInfo  = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;
  const StatusIcon  = statusInfo.icon;
  const isComplete  = statusKey === "complete" && status?.bankVerified;
  const isReady     = !isLoading && !!status;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
      </div>
    );
  }

  // ── No contractor record ──────────────────────────────────────────────────
  if (isReady && !status?.hasContractorRecord) {
    return (
      <div className="flex flex-col bg-slate-50 overflow-hidden" style={{ height: "100dvh" }}>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
            onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-[17px] text-slate-800">Payout Account</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <CreditCard className="w-8 h-8 text-gray-400" />
          </div>
          <p className="font-bold text-[18px] text-slate-800">Not set up as a contractor</p>
          <p className="text-[14px] text-slate-500 leading-relaxed max-w-xs">
            Your manager hasn't added you as a contractor yet. Once they do, you'll be able to connect your payout account here.
          </p>
        </div>
        <StaffPortalNav />
      </div>
    );
  }

  // ── Stripe not configured ─────────────────────────────────────────────────
  if (isReady && !status?.stripeConfigured) {
    return (
      <div className="flex flex-col bg-slate-50 overflow-hidden" style={{ height: "100dvh" }}>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
            onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-[17px] text-slate-800">Payout Account</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-amber-400" />
          </div>
          <p className="font-bold text-[18px] text-slate-800">Payouts not yet enabled</p>
          <p className="text-[14px] text-slate-500 leading-relaxed max-w-xs">
            Your manager hasn't connected a payment processor yet. Check back once they've enabled payouts for this location.
          </p>
        </div>
        <StaffPortalNav />
      </div>
    );
  }

  // ── Embedded onboarding component active ─────────────────────────────────
  if (showEmbedded && connectInstance) {
    return (
      <div className="flex flex-col bg-white overflow-hidden" style={{ height: "100dvh" }}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
            onClick={handleOnboardingExit}
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-[17px] text-slate-800">Connect Payout Account</h1>
        </div>

        {/* Embedded Stripe component */}
        <div className="flex-1 overflow-y-auto pb-16" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}>
          <ConnectComponentsProvider connectInstance={connectInstance}>
            <ConnectAccountOnboarding onExit={handleOnboardingExit} />
          </ConnectComponentsProvider>
        </div>
      </div>
    );
  }

  // ── Main status page ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-slate-50 overflow-hidden" style={{ height: "100dvh" }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="font-bold text-[17px] text-slate-800 flex-1">Payout Account</h1>
        {status?.hasStripeAccount && (
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
            onClick={() => syncStatus.mutate()}
            disabled={syncStatus.isPending}
            aria-label="Refresh status"
          >
            <RefreshCw className={cn("w-4.5 h-4.5 text-slate-400", syncStatus.isPending && "animate-spin")} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-44">

        {/* Hero status */}
        <div className="bg-white border-b border-slate-100 pb-8 pt-8 flex flex-col items-center gap-3">
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center",
            isComplete ? "bg-emerald-100" : "bg-teal-50",
          )}>
            {isComplete
              ? <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              : <CreditCard className="w-10 h-10 text-teal-500" />
            }
          </div>
          <div className="text-center">
            <p className="font-bold text-[20px] text-slate-800">
              {isComplete ? "You're all set!" : "Set up direct deposit"}
            </p>
            <p className="text-[13px] text-slate-400 mt-0.5">
              {isComplete
                ? "Your earnings are deposited directly to your bank."
                : "Connect your bank account to receive instant payouts."}
            </p>
          </div>
          {/* Status badge */}
          <div className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border",
            statusInfo.bg, statusInfo.color,
          )}>
            <StatusIcon className="w-3.5 h-3.5" />
            {statusInfo.label}
          </div>
        </div>

        <div className="px-4 mt-5 space-y-4">

          {/* Status rows */}
          {status?.hasStripeAccount && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
              {[
                {
                  label: "Identity verification",
                  icon:  Shield,
                  ok:    statusKey === "complete",
                  desc:  statusKey === "complete" ? "Verified" : "Needs attention",
                },
                {
                  label: "Payment processing",
                  icon:  Zap,
                  ok:    statusKey === "complete",
                  desc:  statusKey === "complete" ? "Active" : "Inactive",
                },
                {
                  label: "Payout account",
                  icon:  CreditCard,
                  ok:    !!status?.bankVerified,
                  desc:  status?.bankVerified ? "Bank connected" : "Not connected",
                },
              ].map(({ label, icon: Icon, ok, desc }) => (
                <div key={label} className="flex items-center gap-3.5 px-4 py-3.5">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    ok ? "bg-emerald-50" : "bg-amber-50",
                  )}>
                    <Icon className={cn("w-4 h-4", ok ? "text-emerald-500" : "text-amber-500")} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-slate-800">{label}</p>
                  </div>
                  <span className={cn(
                    "text-[12px] font-medium px-2.5 py-1 rounded-full",
                    ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                  )}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* What to expect (pre-onboarding) */}
          {!isComplete && (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-3">
              {[
                { icon: Shield,       text: "Handled securely by Stripe — Certxa never sees your banking details" },
                { icon: Clock,        text: "Takes about 5 minutes to complete" },
                { icon: CheckCircle2, text: "Once verified, payouts deposit directly to your account after each service" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <Icon className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-slate-600 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Financial Hub CTA — shown when fully onboarded */}
      {isComplete && (
        <div className="absolute bottom-16 inset-x-0 bg-white border-t border-slate-100 px-4 pt-4 pb-4">
          <button
            onClick={() => navigate("/staff-financial-hub")}
            className="w-full h-13 py-3.5 rounded-2xl bg-teal-500 active:bg-teal-600 text-white font-bold text-[16px] flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <LayoutDashboard className="w-5 h-5" />
            Open Financial Hub
          </button>
          <p className="text-center text-[12px] text-slate-400 mt-2.5">
            View balance, payout history, earnings &amp; tax documents
          </p>
        </div>
      )}

      {/* Bottom CTA — shown during onboarding */}
      {!isComplete && (
        <div className="absolute bottom-16 inset-x-0 bg-white border-t border-slate-100 px-4 pt-4 pb-4 space-y-2.5">
          <button
            onClick={() => startEmbedded.mutate()}
            disabled={startEmbedded.isPending}
            className="w-full h-13 py-3.5 rounded-2xl bg-teal-500 active:bg-teal-600 text-white font-bold text-[16px] flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-sm"
          >
            {startEmbedded.isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Preparing…</>
            ) : (
              <><Zap className="w-5 h-5" />{statusKey === "in_progress" ? "Continue Onboarding" : "Connect Payout Account"}</>
            )}
          </button>

          {/* Fallback redirect link */}
          {!fallbackUrl ? (
            <button
              onClick={() => getRedirectLink.mutate()}
              disabled={getRedirectLink.isPending}
              className="w-full text-center text-[13px] text-slate-400 active:text-slate-600 py-1 flex items-center justify-center gap-1.5"
            >
              {getRedirectLink.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ExternalLink className="w-3.5 h-3.5" />
              }
              Having trouble? Open in Stripe instead
            </button>
          ) : (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center text-[13px] text-teal-600 active:text-teal-700 py-1 flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Stripe onboarding ↗
            </a>
          )}
        </div>
      )}

      <StaffPortalNav />
    </div>
  );
}
