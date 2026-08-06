/**
 * TrialExpired — shown by AccountStatusGate when trial has ended.
 *
 * Displays plan cards inline so the user can subscribe without navigating
 * away. Clicking Subscribe calls /api/subscription/subscribe which returns
 * a Stripe Checkout URL. On return (?status=success) AccountStatusGate
 * re-checks status and lets the user through automatically.
 */

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle, Zap, LogOut, Mail, Loader2, Sparkles, Shield,
  Clock, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Plan definitions (fallback when DB plans unavailable) ───────────────────

const FALLBACK_PLANS = [
  {
    id: null as number | null,
    code: "solo",
    name: "Solo",
    priceMonthly: 900, // cents
    description: "For independent stylists & booth renters",
    popular: false,
    features: [
      "1 calendar",
      "1 staff member",
      "Online booking page",
      "200 SMS/mo",
      "Client profiles & history",
    ],
  },
  {
    id: null as number | null,
    code: "professional",
    name: "Professional",
    priceMonthly: 2200,
    description: "Everything you need, for any salon size",
    popular: true,
    features: [
      "Unlimited calendars",
      "Unlimited staff",
      "Online booking page",
      "Payments & card reader",
      "Unlimited SMS",
      "Google Business Profile sync",
      "Advanced reporting",
      "Priority support",
    ],
  },
  {
    id: null as number | null,
    code: "elite",
    name: "Elite",
    priceMonthly: 4900,
    description: "Full API access for custom integrations",
    popular: false,
    features: [
      "Everything in Professional",
      "50,000 SMS credits/mo",
      "Unlimited API keys",
      "Webhooks & real-time events",
      "Priority support (4 h SLA)",
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  sortOrder: number;
  features: { featureId: string; featureName: string; limitValue: number | null; enabled: boolean }[];
}

interface NormalisedPlan {
  id: number | null;
  code: string;
  name: string;
  priceMonthly: number; // cents
  description: string | null;
  popular: boolean;
  features: string[];
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onSubscribe,
  loading,
}: {
  plan: NormalisedPlan;
  onSubscribe: (plan: NormalisedPlan) => void;
  loading: boolean;
}) {
  const dollars = (plan.priceMonthly / 100).toFixed(0);
  const cents   = plan.priceMonthly % 100;
  const priceStr = cents === 0 ? `$${dollars}` : `$${(plan.priceMonthly / 100).toFixed(2)}`;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6 transition-all",
        plan.popular
          ? "border-teal-400 bg-teal-950/40 shadow-[0_0_40px_-8px_rgba(45,212,191,0.25)] ring-1 ring-teal-400/30"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
      )}
    >
      {/* Popular badge */}
      {plan.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-zinc-950">
            <Star className="w-3 h-3 fill-zinc-950" />
            Most Popular
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <h3 className={cn(
          "text-lg font-bold",
          plan.popular ? "text-teal-300" : "text-white"
        )}>
          {plan.name}
        </h3>
        {plan.description && (
          <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{plan.description}</p>
        )}
      </div>

      {/* Price */}
      <div className="mb-5">
        <span className={cn(
          "text-4xl font-black tracking-tight",
          plan.popular ? "text-teal-300" : "text-white"
        )}>
          {priceStr}
        </span>
        <span className="text-zinc-500 text-sm ml-1">/mo</span>
      </div>

      {/* Features */}
      <ul className="flex-1 space-y-2.5 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckCircle className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              plan.popular ? "text-teal-400" : "text-zinc-500"
            )} />
            <span className="text-zinc-300">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Button
        disabled={loading}
        onClick={() => onSubscribe(plan)}
        className={cn(
          "w-full h-11 font-semibold text-sm transition-all",
          plan.popular
            ? "bg-teal-500 hover:bg-teal-400 text-zinc-950"
            : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Zap className="w-4 h-4 mr-2" />
        )}
        {loading ? "Redirecting…" : "Subscribe"}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrialExpired() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subscribingCode, setSubscribingCode] = useState<string | null>(null);

  // ── Account status (for expiry date) ────────────────────────────────────────
  const { data: statusData } = useQuery<any>({
    queryKey: ["/api/billing/account-status"],
    queryFn: () =>
      fetch("/api/billing/account-status", { credentials: "include" }).then((r) => r.json()),
    staleTime: 0,
  });

  // ── Plans from DB (fallback to hardcoded) ────────────────────────────────────
  const { data: dbPlans } = useQuery<PublicPlan[]>({
    queryKey: ["public-plans"],
    queryFn: () =>
      fetch("/api/plans/public-plans", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : []
      ),
  });

  // Normalise DB plans → NormalisedPlan; fall back to hardcoded if none
  const plans: NormalisedPlan[] = (() => {
    if (dbPlans && dbPlans.length > 0) {
      return dbPlans
        .filter((p) => p.priceMonthly > 0) // exclude free / hidden plans
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          priceMonthly: p.priceMonthly,
          description: p.description,
          popular: p.code === "professional",
          features: p.features
            .filter((f) => f.enabled)
            .map((f) =>
              f.limitValue !== null ? `${f.featureName} (${f.limitValue})` : f.featureName
            ),
        }));
    }
    return FALLBACK_PLANS;
  })();

  // ── Handle Stripe return ─────────────────────────────────────────────────────
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      toast({
        title: "Payment successful! 🎉",
        description: "Your subscription is now active. Welcome aboard!",
      });
      // Invalidate account status so the gate lets them through
      queryClient.invalidateQueries({ queryKey: ["/api/billing/account-status"] });
      queryClient.invalidateQueries({ queryKey: ["my-plan"] });
      queryClient.invalidateQueries({ queryKey: ["public-plans"] });
      setSearchParams({}, { replace: true });
    } else if (status === "cancelled") {
      toast({
        title: "Checkout cancelled",
        description: "No payment was taken. Choose a plan whenever you're ready.",
        variant: "destructive",
      });
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Subscribe ────────────────────────────────────────────────────────────────
  async function handleSubscribe(plan: NormalisedPlan) {
    if (!plan.id) {
      // No DB plan ID — Stripe not configured; nothing we can do here
      toast({
        title: "Plans not yet configured",
        description: "Contact support to set up your subscription.",
        variant: "destructive",
      });
      return;
    }

    setSubscribingCode(plan.code);
    try {
      const res = await fetch("/api/subscription/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start checkout");
      }

      const data = await res.json();

      if (data?.checkoutUrl) {
        // Stripe Checkout — redirect out
        window.location.href = data.checkoutUrl;
        return; // don't clear subscribingCode; page navigates away
      }

      // No Stripe configured but plan switched directly
      toast({ title: "Plan activated", description: "Your subscription is now active." });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/account-status"] });
    } catch (err: any) {
      toast({
        title: "Checkout failed",
        description: err.message,
        variant: "destructive",
      });
      setSubscribingCode(null);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/auth";
  }

  const trialEndsAt = statusData?.trialEndsAt ? new Date(statusData.trialEndsAt) : null;
  const expiredOn   = trialEndsAt
    ? trialEndsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-teal-600 via-teal-400 to-teal-600 shrink-0" />

      {/* Nav bar */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
        <span className="text-xl font-black tracking-tight text-white">
          Certxa<span className="text-teal-400">.</span>
        </span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 py-10 overflow-y-auto">
        <div className="w-full max-w-4xl space-y-10">

          {/* Hero text */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-400 font-medium mb-2">
              <Clock className="w-4 h-4" />
              {expiredOn ? `Trial ended ${expiredOn}` : "Free trial ended"}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              Choose a plan to<br />
              <span className="text-teal-400">keep your access</span>
            </h1>
            <p className="text-zinc-400 text-base max-w-md mx-auto leading-relaxed">
              Your data is safe and waiting. Subscribe to pick up right where you left off — no setup required.
            </p>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {[
              { icon: Shield, label: "Your data is safe" },
              { icon: Sparkles, label: "Instant access on payment" },
              { icon: CheckCircle, label: "Cancel anytime" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Icon className="w-3.5 h-3.5 text-teal-500" />
                {label}
              </span>
            ))}
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-2">
            {plans.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                onSubscribe={handleSubscribe}
                loading={subscribingCode === plan.code}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="text-center space-y-2 pt-2">
            <p className="text-xs text-zinc-600">
              Paid plans redirect to Stripe Checkout. Your card is never stored on our servers.
            </p>
            <p className="text-xs text-zinc-600">
              Questions?{" "}
              <a
                href="mailto:support@certxa.com"
                className="text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1"
              >
                <Mail className="w-3 h-3" />
                support@certxa.com
              </a>
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
