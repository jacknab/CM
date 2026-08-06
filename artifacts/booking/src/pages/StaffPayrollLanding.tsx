import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/hooks/use-features";
import {
  Search,
  Bell,
  ChevronDown,
  Users2,
  Clock,
  DollarSign,
  BarChart3,
  Settings2,
  Zap,
  LayoutDashboard,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const modules = [
  {
    label: "TEAM",
    description: "Manage staff profiles, availability, services and permissions.",
    icon: Users2,
    to: "/payouts/contractors",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-500",
  },
  {
    label: "PAYOUTS",
    description: "ACH direct deposit, commissions, ledger and check payouts.",
    icon: Zap,
    to: "/payouts",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
  },
  {
    label: "TIMECLOCK",
    description: "Track employee hours and attendance.",
    icon: Clock,
    to: "/timeclock",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-500",
  },
  {
    label: "EARNINGS",
    description: "Process pay periods and manage payroll.",
    icon: DollarSign,
    to: "/payroll",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  {
    label: "REPORTS",
    description: "Commissions, salon earnings and earnings summaries.",
    icon: BarChart3,
    to: "/reports",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-500",
  },
  {
    label: "SETTINGS",
    description: "Earnings settings, pay periods and preferences.",
    icon: Settings2,
    to: "/payroll-settings",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-500",
  },
];

function ModuleCard({
  mod,
  onClick,
  className,
}: {
  mod: (typeof modules)[0];
  onClick: () => void;
  className?: string;
}) {
  const Icon = mod.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-5 bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer border border-slate-100 h-[190px]",
        className
      )}
    >
      <div
        className={`w-[72px] h-[72px] rounded-full flex items-center justify-center ${mod.iconBg}`}
      >
        <Icon className={`w-9 h-9 ${mod.iconColor}`} />
      </div>
      <span className="text-[13px] font-bold tracking-widest text-slate-700 text-center leading-snug whitespace-pre-line">
        {mod.label}
      </span>
    </button>
  );
}

export default function StaffPayrollLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const features = useFeatureFlags();
  const visibleModules = modules.filter((m) => {
    if (m.to === "/timeclock" && !features.timeclock) return false;
    return true;
  });

  void user;

  const initials = (
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    (user?.firstName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()
  );

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div className="relative min-h-screen bg-white overflow-hidden flex flex-col">
        {/* Top-right wave decoration */}
        <div
          className="pointer-events-none absolute top-0 right-0 w-48 h-40 opacity-40"
          aria-hidden
        >
          <svg
            viewBox="0 0 200 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <ellipse cx="170" cy="30" rx="130" ry="90" fill="#99f6e4" />
            <ellipse cx="200" cy="100" rx="100" ry="70" fill="#6ee7b7" />
          </svg>
        </div>

        {/* Bottom wave decoration */}
        <div
          className="pointer-events-none absolute bottom-16 left-0 right-0 h-40 opacity-30"
          aria-hidden
        >
          <svg
            viewBox="0 0 400 160"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <ellipse cx="200" cy="160" rx="260" ry="120" fill="#99f6e4" />
            <ellipse cx="80" cy="180" rx="160" ry="100" fill="#6ee7b7" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col px-5 pt-14 pb-4">
          {/* Top row: wordmark left, avatar right */}
          <div className="absolute top-6 left-5 right-5 flex items-center justify-between">
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 700,
                fontSize: "1.55rem",
                letterSpacing: "-0.02em",
                color: "#3B0764",
                lineHeight: 1,
              }}
            >
              Certxa<span style={{ color: "#F59E0B" }}>.</span>
            </span>

            <button
              className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-md"
              onClick={() => navigate("/account")}
            >
              {initials}
            </button>
          </div>

          {/* Search bar */}
          <div className="mb-5">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2.5 shadow-sm">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-slate-600 placeholder:text-slate-400 w-full"
              />
              <Bell className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </div>

          {/* Heading */}
          <div className="mb-5">
            <h1 className="text-3xl font-bold text-slate-800 leading-tight">
              Staff &amp; Earnings
            </h1>
            <p className="text-slate-500 mt-1 text-base">
              Manage your team and earnings settings
            </p>
          </div>

          {/* Module grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
            {visibleModules.map((mod) => (
              <ModuleCard
                key={mod.label}
                mod={mod}
                onClick={() => navigate(mod.to)}
                className="h-[120px] p-3 gap-2.5 rounded-xl"
              />
            ))}
          </div>
        </div>

        {/* Bottom tab bar */}
        <div
          className="relative z-20 bg-white border-t border-slate-100 flex items-center justify-around"
          style={{
            height: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <button
            className="flex flex-col items-center gap-1 px-6 py-2"
            onClick={() => navigate("/manage")}
          >
            <LayoutDashboard className="w-6 h-6 text-teal-500" />
            <span className="text-[11px] font-semibold text-teal-500">
              Dashboard
            </span>
          </button>
        </div>
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <AppLayout>
      <div className="relative min-h-full">
        {/* Background decoration */}
        <div
          className="pointer-events-none absolute top-0 right-0 w-96 h-64 opacity-30"
          aria-hidden
        >
          <svg
            viewBox="0 0 400 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <ellipse cx="320" cy="60" rx="220" ry="140" fill="#99f6e4" />
            <ellipse cx="380" cy="160" rx="160" ry="100" fill="#6ee7b7" />
          </svg>
        </div>

        <div className="relative z-10">
          {/* Top bar */}
          <div className="flex items-center justify-end gap-3 mb-8 pt-1">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 shadow-sm w-56">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-slate-600 placeholder:text-slate-400 w-full"
              />
            </div>

            <button className="relative w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-white" />
            </button>

            <button
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-1 pr-3 py-1 shadow-sm hover:bg-slate-50 transition-colors"
              onClick={() => navigate("/account")}
            >
              <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 leading-tight">
              Staff &amp; Earnings
            </h1>
            <p className="text-slate-500 mt-1">
              Manage your team and earnings settings
            </p>
          </div>

          {/* Module grid — 4 columns */}
          <div className="grid grid-cols-4 gap-4">
            {visibleModules.map((mod) => (
              <ModuleCard
                key={mod.label}
                mod={mod}
                onClick={() => navigate(mod.to)}
              />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
