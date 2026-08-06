import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  LayoutDashboard, Users, Scroll, BarChart3, ChevronLeft, Percent, TrendingUp, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  {
    to: "/payouts/contractors",
    label: "Team",
    icon: Users,
    exact: false,
    alsoActive: [],
  },
  {
    to: "/payouts",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
    alsoActive: ["/payouts/run"],
  },
  {
    to: "/payouts/ledger",
    label: "Ledger",
    icon: Scroll,
    exact: false,
    alsoActive: ["/payouts/checks"],
  },
  {
    to: "/payouts/deductions",
    label: "Deductions",
    icon: Percent,
    exact: false,
    alsoActive: [],
  },
  {
    to: "/payouts/commissions",
    label: "Commissions",
    icon: TrendingUp,
    exact: false,
    alsoActive: [],
  },
  {
    to: "/payouts/balance",
    label: "Balance",
    icon: Wallet,
    exact: false,
    alsoActive: [],
  },
  {
    to: "/payouts/reports",
    label: "Reports & Docs",
    icon: BarChart3,
    exact: false,
    alsoActive: ["/payouts/tax-docs", "/payouts/schedule"],
  },
];

export default function PayoutsLayout() {
  const loc = useLocation();
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Sticky back header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 1px 3px 0 rgb(0 0 0 / .06)",
          }}
        >
          <button
            onClick={() => navigate("/payouts/contractors")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontSize: ".82rem",
              fontWeight: 600,
              color: "#374151",
              transition: "background .12s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#f9fafb")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#fff")}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Staff &amp; Earnings
          </button>
          <div style={{ width: 1, height: 18, background: "#e5e7eb", flexShrink: 0 }} />
          <span style={{ fontSize: ".92rem", fontWeight: 700, color: "#1c1917" }}>Payouts</span>
        </div>

        {/* Sub-nav tabs */}
        <div className="bg-white border-b border-gray-100 px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {NAV.map((n) => {
              const active = n.exact
                ? loc.pathname === n.to
                : loc.pathname.startsWith(n.to) ||
                  (n.alsoActive ?? []).some(p => loc.pathname.startsWith(p));
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    active
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200"
                  )}
                >
                  <n.icon className="w-4 h-4" />
                  {n.label}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto bg-[#f7f8fa]">
          <Outlet />
        </div>
      </div>
    </AppLayout>
  );
}
