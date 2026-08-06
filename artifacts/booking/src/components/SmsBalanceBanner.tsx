import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { AlertTriangle, X, ShoppingCart, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOW_THRESHOLD = 20;
const CRITICAL_THRESHOLD = 5;

const SMS_PACKAGES = [
  { id: "10", price: "$10", credits: 333 },
  { id: "25", price: "$25", credits: 833 },
  { id: "50", price: "$50", credits: 1666 },
];

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

interface SmsStatus {
  smsAllowance: number;
  smsCredits: number;
  planMonthlyAllowance: number;
  planName: string;
}

export function SmsBalanceBanner() {
  const { selectedStore } = useSelectedStore();
  const [dismissed, setDismissed] = useState(false);
  const [upsellShown, setUpsellShown] = useState(() => sessionStorage.getItem("sms_upsell_shown") === "1");
  const [showUpsell, setShowUpsell] = useState(false);

  const { data: smsStatus } = useQuery<SmsStatus>({
    queryKey: ["sms-status", selectedStore?.id],
    queryFn: () => apiFetch(`/api/billing/sms-status/${selectedStore!.id}`),
    enabled: !!selectedStore?.id,
    refetchInterval: 60_000,
  });

  const total = (smsStatus?.smsAllowance ?? 0) + (smsStatus?.smsCredits ?? 0);
  const isCritical = total <= CRITICAL_THRESHOLD && total >= 0;
  const isLow = total <= LOW_THRESHOLD && total > CRITICAL_THRESHOLD;
  const shouldShow = (isLow || isCritical) && !dismissed;

  const smsBucketMutation = useMutation({
    mutationFn: (packageId: string) =>
      apiFetch("/api/billing/sms-bucket/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId: selectedStore?.id, packageId }),
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  // Auto-show upsell modal when critical, once per session
  useEffect(() => {
    if (isCritical && !upsellShown && smsStatus) {
      setShowUpsell(true);
      setUpsellShown(true);
      sessionStorage.setItem("sms_upsell_shown", "1");
    }
  }, [isCritical, upsellShown, smsStatus]);

  if (!shouldShow) return null;

  return (
    <>
      {/* Banner */}
      <div
        className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium border-b ${
          isCritical
            ? "bg-red-950/60 border-red-500/30 text-red-200"
            : "bg-amber-950/60 border-amber-500/30 text-amber-200"
        }`}
      >
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isCritical ? "text-red-400" : "text-amber-400"}`} />
        <span className="flex-1">
          {isCritical
            ? `Critical: Only ${total} SMS credit${total === 1 ? "" : "s"} remaining — outbound SMS will stop when depleted.`
            : `Low SMS balance: ${total} credit${total === 1 ? "" : "s"} remaining (allowance + purchased).`}
        </span>
        <Button
          size="sm"
          onClick={() => setShowUpsell(true)}
          className={`text-xs h-7 px-3 flex-shrink-0 ${
            isCritical
              ? "bg-red-600 hover:bg-red-500 text-white"
              : "bg-amber-600 hover:bg-amber-500 text-white"
          }`}
        >
          Buy SMS Credits
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className={`p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0 ${
            isCritical ? "text-red-400 hover:text-red-200" : "text-amber-400 hover:text-amber-200"
          }`}
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Upsell modal */}
      {showUpsell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowUpsell(false)}
        >
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Running low on SMS</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {total} credit{total === 1 ? "" : "s"} remaining
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUpsell(false)}
                className="text-zinc-500 hover:text-white transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-zinc-400 text-sm leading-relaxed">
              Add a one-time SMS credit bundle to keep messages flowing.
              Credits never expire and are used automatically after your monthly allowance runs out.
            </p>

            {/* Package grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {SMS_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => smsBucketMutation.mutate(pkg.id)}
                  disabled={smsBucketMutation.isPending}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-700/50 bg-zinc-800/40 hover:border-violet-500/50 hover:bg-violet-500/[0.08] p-3.5 transition-all disabled:opacity-50 group"
                >
                  {smsBucketMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  ) : (
                    <span className="text-white font-bold text-base group-hover:text-violet-200 transition-colors">
                      {pkg.price}
                    </span>
                  )}
                  <span className="text-zinc-400 text-xs font-medium">
                    {pkg.credits.toLocaleString()} SMS
                  </span>
                </button>
              ))}
            </div>

            <p className="text-zinc-600 text-[11px] text-center">
              Redirects to Stripe checkout · credits added instantly
            </p>
          </div>
        </div>
      )}
    </>
  );
}
