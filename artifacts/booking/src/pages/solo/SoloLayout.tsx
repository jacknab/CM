/**
 * The Solo dashboard on the website (/solo, owner 2026-11-06; plans/solo-web-dashboard.md): its own layout for a
 * Certxa Pro (Solo) account, separate from the salon dashboard. Settings stay in the app. Only Solo accounts get in:
 * anyone else goes to the salon dashboard, and a signed-out visitor to the sign-in page.
 */
import { createContext, useContext } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, Home, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isProAccount } from "@shared/proAccount";
import { isSoloPlanCode } from "@shared/soloPlan";

export type SoloStore = { id: number; name: string; timezone: string | null; bookingSlug?: string | null };
type SoloCtx = { store: SoloStore; user: { firstName?: string | null; staffId?: number | null } };
const Ctx = createContext<SoloCtx | null>(null);

export function useSolo(): SoloCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSolo outside the Solo layout");
  return ctx;
}

export const SOLO_COLORS = {
  background: "#F7F5FD",
  text: "#11152E",
  muted: "#6B6F86",
  border: "#E7E3F3",
  primary: "#7C3AED",
};

// Pages as they are built (Clients and Catalog follow).
const NAV = [
  { to: "/solo", label: "Home", icon: Home, end: true },
  { to: "/solo/calendar", label: "Calendar", icon: CalendarDays, end: false },
  { to: "/solo/billing", label: "Billing", icon: CreditCard, end: false },
];

export default function SoloLayout() {
  const { user, isLoading, logout } = useAuth() as any;
  const location = useLocation();

  const { data: stores, isLoading: storesLoading } = useQuery<SoloStore[]>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const r = await fetch("/api/stores", { credentials: "include" });
      if (!r.ok) throw new Error("Could not load your business");
      return r.json();
    },
    enabled: !!user,
  });
  const store = stores?.[0];
  const { data: features, isLoading: planLoading } = useQuery<{ planCode?: string | null }>({
    queryKey: ["/api/plans/my-features", store?.id],
    queryFn: async () => {
      const r = await fetch(`/api/plans/my-features?storeId=${store!.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Could not load your plan");
      return r.json();
    },
    enabled: !!store && !isProAccount(user?.accountType),
  });

  if (isLoading || (user && (storesLoading || (!isProAccount(user.accountType) && planLoading)))) {
    return <div className="flex min-h-screen items-center justify-center" style={{ background: SOLO_COLORS.background }}><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }
  if (!user) return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isProAccount(user.accountType) && !isSoloPlanCode(features?.planCode)) return <Navigate to="/" replace />;
  if (!store) return <Navigate to="/" replace />;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${isActive ? "bg-[#F1ECFD] text-[#11152E]" : "text-[#6B6F86] hover:bg-[#F7F5FD] hover:text-[#11152E]"}`;

  return (
    <Ctx.Provider value={{ store, user }}>
      <div className="fixed inset-0 flex overflow-hidden" style={{ background: SOLO_COLORS.background, color: SOLO_COLORS.text }}>
        {/* Computer: a sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-white px-4 py-6 md:flex" style={{ borderColor: SOLO_COLORS.border }}>
          <p className="truncate px-3 text-[15px] font-semibold">{store.name}</p>
          <p className="px-3 text-xs" style={{ color: SOLO_COLORS.muted }}>Certxa Pro</p>
          <nav className="mt-6 flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} state={to === "/solo/billing" ? { fromDashboard: true } : undefined} className={linkClass}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />{label}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => logout()} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[#6B6F86] hover:bg-[#F7F5FD] hover:text-[#11152E]">
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />Sign out
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phone: a header */}
          <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden" style={{ borderColor: SOLO_COLORS.border }}>
            <Link to="/solo" className="truncate text-[15px] font-semibold">{store.name}</Link>
            <button type="button" onClick={() => logout()} className="text-sm font-medium" style={{ color: SOLO_COLORS.muted }}>Sign out</button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
          {/* Phone: tabs */}
          <nav className="flex border-t bg-white md:hidden" style={{ borderColor: SOLO_COLORS.border }}>
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} state={to === "/solo/billing" ? { fromDashboard: true } : undefined}
                className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? "text-[#11152E]" : "text-[#6B6F86]"}`}>
                <Icon className="h-5 w-5" strokeWidth={1.75} />{label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </Ctx.Provider>
  );
}
