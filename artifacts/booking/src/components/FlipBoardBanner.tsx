import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, AlertTriangle, Clock, Zap, MessageSquare, Loader2 } from "lucide-react";
import { useSelectedStore } from "@/hooks/use-store";
import { useTrial } from "@/hooks/use-trial";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BannerMessage {
  id: string;
  icon: typeof AlertTriangle;
  text: React.ReactNode;
  ctaLabel?: string;
  ctaAction?: () => void;
  barBg: string;
  ctaBg: string;
  smsAction?: boolean;
}

const FLIP_HALF = 260; // ms for one half of the flip
const INTERVAL_MS = 30_000;
const LOW_SMS = 20;
const CRITICAL_SMS = 5;

const SMS_PACKAGES = [
  { id: "10", price: "$10", credits: 333, priceCents: 1000 },
  { id: "25", price: "$25", credits: 833, priceCents: 2500 },
  { id: "50", price: "$50", credits: 1666, priceCents: 5000 },
];

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// ─── Flip animation state ─────────────────────────────────────────────────────
// "idle"        — rotateX(0),   no transition   (visible, stable)
// "exiting"     — rotateX(-90), transition ON   (flipping away)
// "entering"    — rotateX(90),  no transition   (snapped to start of enter, invisible)
// "entered"     — rotateX(0),   transition ON   (flipping into view)
type FlipPhase = "idle" | "exiting" | "entering" | "entered";

function phaseToTransform(p: FlipPhase) {
  if (p === "exiting")  return "rotateX(-90deg)";
  if (p === "entering") return "rotateX(90deg)";
  return "rotateX(0deg)";
}

function phaseHasTransition(p: FlipPhase) {
  return p === "exiting" || p === "entered";
}

// ─── Component ────────────────────────────────────────────────────────────────
export function FlipBoardBanner() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const { daysRemaining, subscriptionStatus } = useTrial();
  const { toast } = useToast();
  const [showSmsModal, setShowSmsModal] = useState(false);

  // ── SMS status ──────────────────────────────────────────────────────────────
  const { data: smsStatus } = useQuery<{
    smsAllowance: number;
    smsCredits: number;
    planMonthlyAllowance: number;
    planName: string;
    packages: { id: string; priceCents: number; credits: number; label: string }[];
  }>({
    queryKey: ["sms-status-banner", selectedStore?.id],
    queryFn: () => apiFetch(`/api/billing/sms-status/${selectedStore!.id}`),
    enabled: !!selectedStore?.id,
    refetchInterval: 60_000,
  });

  const smsBucketMutation = useMutation({
    mutationFn: (packageId: string) =>
      apiFetch("/api/billing/sms-bucket/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId: selectedStore?.id, packageId }),
      }),
    onSuccess: ({ url }: { url: string }) => {
      setShowSmsModal(false);
      window.location.href = url;
    },
    onError: (err: any) =>
      toast({ title: "Unable to open checkout", description: err.message, variant: "destructive" }),
  });

  // ── Build message list ──────────────────────────────────────────────────────
  const messages: BannerMessage[] = [];

  // Trial / subscription
  const trialTier = (() => {
    if (subscriptionStatus === "expired") return "expired";
    if (subscriptionStatus === "inactive") return "inactive";
    if (subscriptionStatus !== "trial") return null;
    if (daysRemaining === null) return null;
    if (daysRemaining > 7) return "info";
    if (daysRemaining > 2) return "warning";
    return "urgent";
  })();

  if (trialTier) {
    messages.push({
      id: `trial-${trialTier}`,
      icon: trialTier === "info" ? Clock : trialTier === "inactive" ? Zap : AlertTriangle,
      text:
        trialTier === "info" ? (
          <>Your free trial ends in <strong>{daysRemaining} days</strong>.</>
        ) : trialTier === "warning" ? (
          <><strong>{daysRemaining} days left</strong> in your free trial. Subscribe now to avoid interruption.</>
        ) : trialTier === "urgent" ? (
          <><strong>Trial expires in {daysRemaining} day{daysRemaining === 1 ? "" : "s"}!</strong> Your booking page goes offline when it ends.</>
        ) : trialTier === "expired" ? (
          <><strong>Your free trial has ended.</strong> Subscribe now to restore your booking page and dashboard access.</>
        ) : (
          <>Your subscription is inactive. Activate to start accepting bookings.</>
        ),
      ctaLabel: trialTier === "expired" || trialTier === "inactive" ? "Reactivate" : "Subscribe Now",
      ctaAction: () => navigate("/billing"),
      barBg:
        trialTier === "info" ? "bg-indigo-600" :
        trialTier === "warning" ? "bg-amber-600" : "bg-red-700",
      ctaBg: "bg-white/20 hover:bg-white/30 border border-white/30 text-white",
    });
  }

  // SMS credits
  const smsTotal = (smsStatus?.smsAllowance ?? 0) + (smsStatus?.smsCredits ?? 0);
  const smsCritical = smsStatus !== undefined && smsTotal <= CRITICAL_SMS;
  const smsLow = smsStatus !== undefined && smsTotal <= LOW_SMS && smsTotal > CRITICAL_SMS;

  if (smsCritical || smsLow) {
    messages.push({
      id: smsCritical ? "sms-critical" : "sms-low",
      icon: MessageSquare,
      text: smsTotal === 0
        ? <>SMS credits depleted — outbound messages are paused.</>
        : smsCritical
        ? <>{smsTotal} SMS credit{smsTotal === 1 ? "" : "s"} remaining.</>
        : <>Running low on SMS — {smsTotal} credit{smsTotal === 1 ? "" : "s"} left.</>,
      ctaLabel: smsTotal === 0 ? "Purchase SMS Package" : "Buy SMS Credits",
      ctaAction: () => setShowSmsModal(true),
      barBg: smsCritical ? "bg-slate-700" : "bg-slate-600",
      ctaBg: "bg-transparent hover:bg-white/10 border border-white/40 text-white",
      smsAction: true,
    });
  }

  // ── Flip state ──────────────────────────────────────────────────────────────
  const [shownIdx, setShownIdx] = useState(0);
  const [phase, setPhase] = useState<FlipPhase>("idle");
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t3 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgCountRef = useRef(messages.length);
  const shownIdxRef = useRef(shownIdx);
  shownIdxRef.current = shownIdx;

  // Keep a stable reference to count for interval callback
  msgCountRef.current = messages.length;

  const runFlip = useCallback(() => {
    if (msgCountRef.current <= 1) return;
    // Phase 1: rotate current content away (0 → -90°)
    setPhase("exiting");
    t1.current = setTimeout(() => {
      // Phase 2: instantly snap to 90° with new content (no transition)
      setShownIdx(prev => (prev + 1) % msgCountRef.current);
      setPhase("entering");
      // Phase 3: one rAF to let the browser paint the 90° start position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Now transition to 0° (flip into view)
          setPhase("entered");
          t2.current = setTimeout(() => {
            setPhase("idle");
          }, FLIP_HALF);
        });
      });
    }, FLIP_HALF);
  }, []);

  // Start interval
  useEffect(() => {
    if (dismissed || messages.length <= 1) return;
    intervalRef.current = setInterval(runFlip, INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [dismissed, messages.length, runFlip]);

  // Cleanup timeouts
  useEffect(() => () => {
    [t1, t2, t3].forEach(r => r.current && clearTimeout(r.current));
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (messages.length === 0 || dismissed) return null;

  const safeIdx = messages.length > 0 ? shownIdx % messages.length : 0;
  const msg = messages[safeIdx];
  if (!msg) return null;

  const Icon = msg.icon;

  return (
    <>
    <div
      className="w-full flex-shrink-0 overflow-hidden"
      style={{ perspective: "800px", perspectiveOrigin: "center center" }}
    >
      <div
        className={cn("w-full", msg.barBg)}
        style={{
          transform: phaseToTransform(phase),
          transition: phaseHasTransition(phase)
            ? `transform ${FLIP_HALF}ms cubic-bezier(0.55, 0, 0.45, 1)`
            : "none",
          transformOrigin: "center center",
          backfaceVisibility: "hidden",
          willChange: "transform",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 gap-4 text-white">
          {/* Message */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Icon className="h-4 w-4 flex-shrink-0 opacity-90" />
            <p className="text-sm leading-snug truncate sm:whitespace-normal sm:overflow-visible">
              {msg.text}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Dot indicator (only when more than 1 message) */}
            {messages.length > 1 && (
              <div className="hidden sm:flex items-center gap-1 mr-1" aria-hidden>
                {messages.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-full transition-all duration-300",
                      i === safeIdx
                        ? "w-4 h-1.5 bg-white"
                        : "w-1.5 h-1.5 bg-white/35"
                    )}
                  />
                ))}
              </div>
            )}

            {/* CTA */}
            {msg.ctaLabel && msg.ctaAction && (
              <button
                onClick={msg.ctaAction}
                disabled={msg.smsAction && smsBucketMutation.isPending}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5",
                  msg.ctaBg
                )}
              >
                {msg.smsAction && smsBucketMutation.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : null}
                {msg.ctaLabel}
              </button>
            )}

            {/* Dismiss */}
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
              className="rounded p-1 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* ── SMS package-picker modal ─────────────────────────────────────── */}
    {showSmsModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && setShowSmsModal(false)}
      >
        <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-semibold">Buy SMS Credits</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  One-time top-up · credits never expire
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSmsModal(false)}
              className="text-zinc-500 hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

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
