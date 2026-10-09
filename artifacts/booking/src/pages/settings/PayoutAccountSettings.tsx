/**
 * PayoutAccountSettings — Salon owner payout account & verification page.
 *
 * Fully embedded Stripe Connect experience — no redirects to stripe.com.
 * Uses @stripe/react-connect-js embedded components for onboarding,
 * payments, payouts, and the notification banner.
 *
 * Flow:
 *   1. Not connected  → "Connect Stripe Account" button (OAuth → comes back here)
 *   2. Connected, incomplete onboarding → embedded ConnectAccountOnboarding
 *   3. Fully set up  → Payments / Payouts tabs
 *
 * The ConnectNotificationBanner is always shown when connected so Stripe can
 * surface important alerts (e.g. verification deadlines) without leaving the app.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CreditCard,
  Zap,
  ChevronRight,
  Building2,
  ShieldCheck,
  Banknote,
  ArrowLeftRight,
  Wallet,
} from "lucide-react";
import { StripeConnectProvider } from "@/components/stripe/StripeConnectProvider";
import { CustomPayoutDashboard } from "@/components/stripe/CustomPayoutDashboard";
import {
  ConnectAccountOnboarding,
  ConnectNotificationBanner,
  ConnectPayments,
} from "@stripe/react-connect-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StripeStatus {
  connected: boolean;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  accountType?: string | null;
  detailsSubmitted?: boolean;
  displayName?: string | null;
  email?: string | null;
  country?: string | null;
  currency?: string | null;
  providerAccountId?: string;
  publishableKey?: string | null;
}

type ManagementTab = "payments" | "payouts";

function StatusRow({ icon: Icon, label, ok, okLabel, badLabel }: {
  icon: React.ElementType; label: string; ok: boolean; okLabel?: string; badLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ok ? "bg-emerald-50" : "bg-amber-50"}`}>
          <Icon className={`w-4.5 h-4.5 ${ok ? "text-emerald-600" : "text-amber-600"}`} style={{ width: 18, height: 18 }} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500">{label}</p>
          <p className={`mt-0.5 truncate text-sm font-semibold ${ok ? "text-gray-900" : "text-amber-800"}`}>
            {ok ? okLabel : badLabel}
          </p>
        </div>
      </div>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
    </div>
  );
}

// ─── Embedded tab button ──────────────────────────────────────────────────────

function TabBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex min-h-11 flex-1 items-center justify-center gap-2 px-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4 sm:flex-none ${
        active
          ? "text-violet-700"
          : "text-gray-500 hover:text-gray-900"
      }`}
    >
      <Icon className={`h-4 w-4 transition-colors ${active ? "text-violet-600" : "text-gray-400 group-hover:text-gray-600"}`} />
      {label}
      <span
        className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-600 transition-all ${active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"}`}
        aria-hidden="true"
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PayoutAccountSettings() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ManagementTab>("payments");

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: status, isLoading } = useQuery<StripeStatus>({
    queryKey: ["/api/payments/stripe/status"],
    queryFn: async () => {
      const res = await fetch("/api/payments/stripe/status", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return { connected: false } as StripeStatus;
        throw new Error("Failed to load payment status");
      }
      return res.json();
    },
    retry: false,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Start the Stripe OAuth Connect flow (initial account connection) */
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments/stripe/connect", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to start Stripe connect");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  /** Re-sync account status from Stripe */
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments/stripe/sync", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payments/stripe/status"] });
      toast({ title: "Status refreshed" });
    },
    onError: (e: Error) => {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnected   = !!(status?.connected && status?.status !== "disconnected");
  const charges       = !!status?.chargesEnabled;
  const identity      = !!status?.detailsSubmitted;
  const payouts       = !!status?.payoutsEnabled;
  const allGood       = isConnected && charges && identity && payouts;
  const actionNeeded  = isConnected && (!charges || !identity || !payouts);
  const publishableKey = status?.publishableKey ?? null;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppLayout fullHeight>
        <div className="mx-auto w-full max-w-[1180px] space-y-5 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout fullHeight>
      <div className="mx-auto w-full max-w-[1180px] space-y-5 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
              <span className="h-px w-5 bg-violet-400" aria-hidden="true" />
              Money movement
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-[28px]">
              Payments &amp; payouts
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Review customer payments, follow transfers to your bank, and keep your account ready to process sales.
            </p>
          </div>
        </div>

        {/* ── Embedded notification banner (always shown when connected) ─ */}
        {isConnected && publishableKey && (
          <StripeConnectProvider publishableKey={publishableKey}>
            <ConnectNotificationBanner />
          </StripeConnectProvider>
        )}

        {/* ── Not connected ─────────────────────────────────────────────── */}
        {!isConnected && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-violet-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Connect your Stripe account
                </p>
                <p className="text-sm text-gray-500 mt-1 max-w-sm">
                  Link your Stripe account to start accepting payments and receiving automatic
                  payouts to your bank account — everything stays inside Certxa.
                </p>
              </div>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-6"
              >
                <Zap className="w-4 h-4" />
                {connectMutation.isPending ? "Redirecting…" : "Connect Stripe Account"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Action required banner ────────────────────────────────────── */}
        {actionNeeded && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Action required</p>
              <p className="text-amber-700 text-sm mt-0.5">
                Complete the setup below to start processing payments.
              </p>
            </div>
          </div>
        )}

        {/* Show readiness details only while setup still needs attention. */}
        {isConnected && !allGood && (
          <Card className="overflow-hidden rounded-2xl border-gray-200 bg-white shadow-[0_1px_2px_rgba(17,24,39,0.03)]">
            <CardHeader className="border-b border-gray-100 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Account readiness
                </CardTitle>
                {status?.displayName && (
                  <p className="truncate text-xs text-gray-500">{status.displayName}{status.email ? ` · ${status.email}` : ""}</p>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <StatusRow icon={Building2}  label="Payment processing"   ok={charges}  okLabel="Active"     badLabel="Inactive" />
                <StatusRow icon={ShieldCheck} label="Identity verification" ok={identity} okLabel="Verified"   badLabel="Info required" />
                <StatusRow icon={Banknote}    label="Payout account"       ok={payouts}  okLabel="Connected"  badLabel="Not set up" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Embedded onboarding (connected but not fully set up) ───────── */}
        {isConnected && !allGood && publishableKey && (
          <StripeConnectProvider publishableKey={publishableKey}>
            <Card className="rounded-2xl border-violet-100 shadow-sm overflow-hidden">
              <CardHeader className="px-6 pt-5 pb-3 bg-violet-50/60 border-b border-violet-100">
                <CardTitle className="text-base text-violet-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Complete your payment setup
                </CardTitle>
                <p className="text-sm text-violet-700 mt-0.5">
                  Finish the steps below to activate payments and payouts.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ConnectAccountOnboarding
                  onExit={() => {
                    // Refresh status when the user exits onboarding (completed or abandoned)
                    syncMutation.mutate();
                  }}
                  onLoadError={(err) => {
                    console.error("[StripeConnect] Onboarding load error:", err);
                    toast({
                      title: "Unable to load onboarding",
                      description: "Please try refreshing. If the issue persists, contact support.",
                      variant: "destructive",
                    });
                  }}
                />
              </CardContent>
            </Card>
          </StripeConnectProvider>
        )}

        {/* ── Payments / Payouts dashboard (fully set up) ─────────────────── */}
        {isConnected && allGood && publishableKey && (
          <StripeConnectProvider publishableKey={publishableKey}>
            <Card className="overflow-hidden rounded-2xl border-gray-200 bg-white shadow-[0_12px_35px_-24px_rgba(76,29,149,0.28)]">
              <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-violet-50/70 via-white to-white px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-gray-950" style={{ fontFamily: "Outfit, sans-serif" }}>
                      Activity
                    </CardTitle>
                  </div>
                  <div className="flex w-full gap-6 border-b border-gray-200 sm:w-auto" role="group" aria-label="Payment activity view">
                    <TabBtn active={activeTab === "payments"} onClick={() => setActiveTab("payments")} icon={ArrowLeftRight}  label="Payments" />
                    <TabBtn active={activeTab === "payouts"}  onClick={() => setActiveTab("payouts")}  icon={Wallet}          label="Payouts"  />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="min-h-[440px] p-0 sm:p-1">
                {activeTab === "payments" && <ConnectPayments />}
                {activeTab === "payouts"  && <CustomPayoutDashboard accountType={status?.accountType ?? undefined} />}
              </CardContent>
            </Card>
          </StripeConnectProvider>
        )}

        {/* ── POS / Terminal link ───────────────────────────────────────── */}
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          onClick={() => navigate("/manage/payment-settings")}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Point of Sale &amp; Card Reader</p>
              <p className="text-xs text-gray-500">Manage Terminal hardware and in-person payments</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>

      </div>
    </AppLayout>
  );
}
