import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  CalendarDays,
  BarChart3,
  Settings,
  DollarSign,
  TrendingUp,
  FileText,
  Clock,
  LogOut,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type StaffProfileData = {
  id: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  color: string | null;
};

// ── Individual card ────────────────────────────────────────────────────────────

function DashCard({
  icon: Icon,
  label,
  bg,
  iconColor,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  bg: string;
  iconColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 bg-white rounded-2xl py-6 px-2 shadow-sm border border-slate-100 active:scale-95 active:shadow-none transition-all duration-150 select-none"
    >
      <div
        className="w-[58px] h-[58px] rounded-full flex items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <Icon className="w-[26px] h-[26px]" style={{ color: iconColor }} />
      </div>
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 text-center leading-tight px-1">
        {label}
      </span>
    </button>
  );
}

// ── Timeclock widget ──────────────────────────────────────────────────────────

function TimeclockWidget({ staffId, storeId }: { staffId: number; storeId: number }) {
  const [toggling, setToggling] = useState(false);
  const { data: status, refetch } = useQuery<{ clockedIn: boolean; record: { clockIn: string } | null }>({
    queryKey: ["/api/timeclock/status", staffId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/timeclock/status/${staffId}?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return { clockedIn: false, record: null };
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const clockedIn = status?.clockedIn ?? false;
  const clockInTime = status?.record?.clockIn
    ? new Date(status.record.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const toggle = async () => {
    setToggling(true);
    try {
      const url = clockedIn ? "/api/timeclock/clock-out" : "/api/timeclock/clock-in";
      await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, staffId }),
      });
      await refetch();
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="mx-4 mb-4 bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className={cn(
        "w-11 h-11 rounded-full flex items-center justify-center shrink-0",
        clockedIn ? "bg-emerald-100" : "bg-slate-100",
      )}>
        <Clock className={cn("w-5 h-5", clockedIn ? "text-emerald-600" : "text-slate-400")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[14px] text-slate-800 leading-snug">
          {clockedIn ? "Clocked In" : "Not Clocked In"}
        </p>
        {clockedIn && clockInTime && (
          <p className="text-[12px] text-slate-400">Since {clockInTime}</p>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={toggling}
        className={cn(
          "px-4 py-2 rounded-xl text-[13px] font-bold shrink-0 transition-colors",
          clockedIn
            ? "bg-red-50 text-red-600 active:bg-red-100"
            : "bg-emerald-50 text-emerald-700 active:bg-emerald-100",
        )}
      >
        {toggling ? "…" : clockedIn ? "Clock Out" : "Clock In"}
      </button>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "booking_user_session";

async function doLogout(navigate: ReturnType<typeof useNavigate>, queryClient: ReturnType<typeof useQueryClient>) {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch { /* ignore */ }
  queryClient.clear();
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  navigate("/staff-auth", { replace: true });
}

export default function StaffDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const { data: profile } = useQuery<StaffProfileData>({
    queryKey: ["/api/staff/me/profile"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    staleTime: 60_000,
  });

  const firstName =
    profile?.name?.split(" ")[0] ??
    user?.firstName ??
    "there";

  const initials = (profile?.name ?? user?.firstName ?? "S")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const avatarUrl   = profile?.avatarUrl ?? null;
  const staffColor  = profile?.color ?? "#14b8a6";

  // Cards configuration
  const cards = [
    {
      icon: BarChart3,
      label: "Overview",
      bg: "#d1fae5",
      iconColor: "#059669",
      path: "/staff-overview",
    },
    {
      icon: CalendarDays,
      label: "Calendar",
      bg: "#ede9fe",
      iconColor: "#7c3aed",
      path: "/staff-calendar",
    },
    {
      icon: TrendingUp,
      label: "Staff & Earnings",
      bg: "#fef9c3",
      iconColor: "#ca8a04",
      path: "/staff-income",
    },
    {
      icon: DollarSign,
      label: "Tips & POS",
      bg: "#dcfce7",
      iconColor: "#16a34a",
      path: "/staff-pos",
    },
    {
      icon: FileText,
      label: "1099 Info",
      bg: "#fef3c7",
      iconColor: "#d97706",
      path: "/staff-1099",
    },
    {
      icon: History,
      label: "History",
      bg: "#ede9fe",
      iconColor: "#7c3aed",
      path: "/staff-history",
    },
    {
      icon: Settings,
      label: "Settings",
      bg: "#f3e8ff",
      iconColor: "#9333ea",
      path: "/staff-profile",
    },
  ];

  return (
    <div className="flex flex-col bg-[#f8f8fb] overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden flex-shrink-0">
        {/* Decorative blob */}
        <div
          className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-30 pointer-events-none"
          style={{ background: "radial-gradient(circle, #99f6e4 0%, #2dd4bf 60%, transparent 100%)" }}
        />
        <div
          className="absolute top-0 right-0 w-48 h-48 rounded-bl-[80%] opacity-20 pointer-events-none"
          style={{ backgroundColor: "#5eead4" }}
        />

        <div className="relative z-10 flex items-start justify-between px-5 pt-7 pb-6">
          {/* Logo + text */}
          <div>
            <div className="flex items-center gap-1.5 mb-4">
              <span className="font-extrabold text-[15px] text-slate-800 tracking-tight">
                Certxa<span className="text-teal-500">.</span>
              </span>
            </div>
            <h1 className="text-[28px] font-black leading-tight text-slate-900">
              Welcome back, {firstName}!
            </h1>
            <p className="text-slate-400 text-[13px] font-medium mt-0.5">
              Here's your dashboard
            </p>
          </div>

          {/* Avatar + logout */}
          <div className="flex flex-col items-end gap-2 mt-1">
            <button
              onClick={() => setConfirmLogout(true)}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[11px] font-medium">Sign out</span>
            </button>
          <button
            className="relative flex-shrink-0"
            onClick={() => navigate("/staff-profile")}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[15px] overflow-hidden shadow-md"
              style={{ backgroundColor: staffColor }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : initials}
            </div>
          </button>
          </div>
        </div>
      </header>

      {/* ── Logout confirmation ─────────────────────────────────────────────────── */}
      {confirmLogout && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 mb-1">Sign out?</h3>
            <p className="text-slate-500 text-sm mb-5">You'll need to log back in to access your dashboard.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 h-12 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doLogout(navigate, queryClient)}
                className="flex-1 h-12 rounded-2xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Timeclock card ─────────────────────────────────────────────────────── */}
      {profile?.id && selectedStore?.id && (
        <TimeclockWidget staffId={profile.id} storeId={selectedStore.id} />
      )}

      {/* ── Card grid ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pb-4 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cards.map((card) => (
            <DashCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              bg={card.bg}
              iconColor={card.iconColor}
              onClick={() => navigate(card.path)}
            />
          ))}
        </div>
      </main>

      {/* ── Bottom nav ─────────────────────────────────────────────────────────── */}
      <StaffPortalNav />

    </div>
  );
}
