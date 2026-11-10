import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";

type Attention = { needed: boolean; paused: boolean; deadline: string | null };

/**
 * Thin banner at the top of every dashboard page (owner, 2026-11-10) while Stripe is waiting on the owner for more
 * details after setup (server: lib/paymentsAttention.ts). Opens Payments › Payouts, where Stripe's own form takes them.
 * Owners only: the status call refuses staff, so they never see it.
 */
export function PaymentsAttentionBanner() {
  const { pathname } = useLocation();
  const { data } = useQuery<{ attention?: Attention } | null>({
    queryKey: ["/api/payments/stripe/status", "attention"],
    queryFn: async () => {
      const res = await fetch("/api/payments/stripe/status", { credentials: "include" });
      return res.ok ? res.json() : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const attention = data?.attention;
  if (!attention?.needed || pathname === "/payments/payouts") return null;
  const deadline = attention.deadline
    ? new Date(attention.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;
  return (
    <Link
      to="/payments/payouts"
      className="block shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[13px] font-medium text-amber-900 hover:bg-amber-100"
      data-testid="payments-attention-banner"
    >
      {attention.paused
        ? "Stripe has paused card payments or payouts until you add the details it asked for."
        : `Stripe needs more details to keep your card payments on${deadline ? ` after ${deadline}` : ""}.`}{" "}
      <span className="underline">Add them</span>
    </Link>
  );
}
