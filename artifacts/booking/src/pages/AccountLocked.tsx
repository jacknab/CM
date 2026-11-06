import { useNavigate } from "react-router-dom";
import { Lock, Plus, LogOut, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function AccountLocked() {
  const navigate = useNavigate();
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const { data: statusData } = useQuery<any>({
    queryKey: ["/api/billing/account-status"],
    queryFn: () =>
      fetch("/api/billing/account-status", { credentials: "include" }).then((r) => r.json()),
  });

  const lockedAt = statusData?.lockedAt
    ? new Date(statusData.lockedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // The plan the salon had before it was locked (owner, 2026-11-06). It used to restart on the free Solo plan,
  // which reopened the whole account without paying; Solo is only in the Certxa Pro app now.
  const previousPlan: { code: string; name: string; priceMonthly: number } | null = statusData?.previousPlan ?? null;

  async function handleNewSubscription() {
    if (!previousPlan) return;
    setStartingCheckout(true);
    setCheckoutError("");
    try {
      const salonId = statusData?.salonId;
      if (!salonId) return;
      const res = await fetch(`/api/billing/subscribe/${salonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planCode: previousPlan.code, interval: "month" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url;
      else setCheckoutError(data.error || "Checkout could not be started. Please try again or contact support.");
    } catch {
      setCheckoutError("Checkout could not be started. Please try again or contact support.");
    } finally {
      setStartingCheckout(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    navigate("/auth");
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      {/* Red top bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-red-600" />

      <div className="w-full max-w-lg space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Lock className="w-10 h-10 text-red-400" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-white">Account Deactivated</h1>
          <p className="text-zinc-400 text-base leading-relaxed">
            Your subscription was canceled due to non-payment
            {lockedAt ? ` on ${lockedAt}` : ""}.
            Your account data has been retained and will be available once you
            create a new subscription.
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium">Why was my account deactivated?</p>
              <p className="text-zinc-500 mt-1 leading-relaxed">
                After 30 days of a failed payment, we automatically cancel the
                subscription to prevent further charges. All your appointments,
                services, staff, and client records are still on file.
              </p>
            </div>
          </div>
        </div>

        {/* What you get back */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <p className="text-sm font-medium text-zinc-300">What you'll get back immediately</p>
          <ul className="space-y-2">
            {[
              "Full access to your dashboard and calendar",
              "All your client and appointment history",
              "Your services, staff, and products",
              "Online booking and POS",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {previousPlan ? (
            <Button
              className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base"
              onClick={handleNewSubscription}
              disabled={startingCheckout}
            >
              <Plus className="w-5 h-5 mr-2" />
              {startingCheckout
                ? "Preparing checkout…"
                : `Restart ${previousPlan.name} · $${(previousPlan.priceMonthly / 100).toFixed(previousPlan.priceMonthly % 100 ? 2 : 0)}/month`}
            </Button>
          ) : statusData ? (
            <a href="mailto:support@certxa.com"
              className="flex w-full h-12 items-center justify-center rounded-md bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base">
              Contact support to restart your plan
            </a>
          ) : null}
          {checkoutError && <p className="text-sm text-red-400 text-center">{checkoutError}</p>}

          <Button
            variant="ghost"
            className="w-full text-zinc-500 hover:text-zinc-300 text-sm"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Sign out
          </Button>
        </div>

        {/* Support */}
        <p className="text-center text-xs text-zinc-600">
          Questions?{" "}
          <a
            href="mailto:support@certxa.com"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            Contact our support team
          </a>{" "}
          — we're happy to help.
        </p>
      </div>
    </div>
  );
}
