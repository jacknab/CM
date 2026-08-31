/**
 * AccountStatusGate
 * -----------------
 * Wraps all authenticated app routes. Checks billing account status and
 * applies the appropriate restriction:
 *
 *   locked      → Full block (AccountLocked page) — sub canceled, past grace
 *   suspended   → Only a small allowlist of pages remain reachable (clients,
 *                 categories/services/addons/products, reports, account/billing)
 *                 so the owner can keep serving clients and pay to restore
 *                 service. Everything else (calendar, POS, marketing, staff,
 *                 settings, etc.) shows the AccountSuspended screen instead.
 *   inGracePeriod → Full access with a warning banner (trial ended, 7-day window)
 *   trialExpired → Full block (TrialExpired page) — grace period also over
 *   active      → Children rendered normally
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, X, AlertTriangle } from "lucide-react";
import AccountSuspended from "@/pages/AccountSuspended";
import AccountLocked from "@/pages/AccountLocked";
import TrialExpired from "@/pages/TrialExpired";
import { useAuth } from "@/hooks/use-auth";

interface AccountStatusGateProps {
  children: React.ReactNode;
}

/**
 * The only pages reachable while an account is suspended. Everything not
 * listed here (calendar, POS, marketing, team, most settings, etc.) shows
 * the AccountSuspended screen instead.
 */
const SUSPENDED_ALLOWED_PATHS = [
  // Clients
  "/customers", "/client-lookup", "/client", "/clients",
  // Catalog — categories, services, add-ons, products (+ legacy redirect paths)
  "/catalog/categories", "/catalog/services", "/catalog/addons", "/catalog/products",
  "/services", "/addons", "/products",
  // Reports
  "/reports",
  // Account / billing — so the owner can pay to restore service
  "/account", "/billing",
];

function isSuspendedAllowedPath(pathname: string): boolean {
  return SUSPENDED_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function GracePeriodBanner({ graceEndsAt, onDismiss }: { graceEndsAt: string | null; onDismiss: () => void }) {
  const daysLeft = graceEndsAt
    ? Math.max(0, Math.ceil((new Date(graceEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-medium shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Your free trial has ended.{" "}
          {daysLeft !== null && daysLeft > 0
            ? `You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left before your calendar is restricted.`
            : "Your account will be suspended soon."}
          {" "}
          <a href="/billing" className="underline underline-offset-2 hover:opacity-80">
            Subscribe now to keep full access.
          </a>
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 hover:opacity-70 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function SuspendedAccessScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold text-white">Account suspended</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          This page isn't available while your account is suspended. Pay any outstanding balance on your billing page to restore full access.
        </p>
        <p className="text-zinc-500 text-sm">
          You can still manage clients, services, add-ons, products, and reports.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <a
            href="/billing"
            className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            Go to billing
          </a>
          <a
            href="/customers"
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            Go to clients
          </a>
        </div>
      </div>
    </div>
  );
}

export function AccountStatusGate({ children }: AccountStatusGateProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [graceDismissed, setGraceDismissed] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<{
    accountStatus: string | null;
    suspendedAt: string | null;
    lockedAt: string | null;
    suspendedReason: string | null;
    salonId: number | null;
    trialExpired: boolean;
    inGracePeriod: boolean;
    graceEndsAt: string | null;
    trialEndsAt: string | null;
    subscriptionStatus: string | null;
  } | null>({
    queryKey: ["/api/billing/account-status"],
    queryFn: () =>
      fetch("/api/billing/account-status", { credentials: "include" }).then((r) => {
        if (!r.ok) return null;
        return r.json();
      }),
    enabled: !!user,
    retry: false,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (!user) return;
    const forceRefetch = () => { void refetch(); };
    forceRefetch();
    window.addEventListener("focus", forceRefetch);
    window.addEventListener("pageshow", forceRefetch);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") forceRefetch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", forceRefetch);
      window.removeEventListener("pageshow", forceRefetch);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, refetch]);

  useEffect(() => {
    const storeId = data?.salonId;
    if (!user || !storeId) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/ws/notifications?storeId=${storeId}`);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "account_status_changed") void refetch();
        } catch { /* ignore */ }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, [user, data?.salonId, refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  // Failed request or no billing profile → allow through (never block a fresh account).
  if (isError || !data || !data.accountStatus) {
    return <>{children}</>;
  }

  // ── Full lockout (canceled subscription, no recovery path from UI) ──────────
  if (data.accountStatus === "locked") {
    return <AccountLocked />;
  }

  // ── Suspended — only clients/catalog/reports/billing remain reachable ─────
  if (data.accountStatus === "suspended") {
    if (isSuspendedAllowedPath(location.pathname)) {
      return <>{children}</>;
    }
    return <SuspendedAccessScreen />;
  }

  // ── Trial ended but still within 7-day grace period ───────────────────────
  if (data.inGracePeriod) {
    return (
      <>
        {!graceDismissed && (
          <GracePeriodBanner
            graceEndsAt={data.graceEndsAt}
            onDismiss={() => setGraceDismissed(true)}
          />
        )}
        <div className={!graceDismissed ? "pt-10" : undefined}>
          {children}
        </div>
      </>
    );
  }

  // ── Trial fully expired (grace period also over, account not yet suspended) ─
  if (data.trialExpired) {
    return <TrialExpired />;
  }

  // accountStatus === 'active' or any other unrecognized value → allow through.
  return <>{children}</>;
}
