import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Settings2, Globe, LogOut, DollarSign, Receipt, CreditCard, LayoutDashboard } from "lucide-react";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import { useAuth } from "@/hooks/use-auth";

type StaffProfileData = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  color: string | null;
};

type StripeStatus = {
  hasContractorRecord: boolean;
  onboardingStatus?: string;
  bankVerified?: boolean;
  stripeConfigured?: boolean;
};

type MenuRow = {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: boolean;
};

export default function StaffMenu() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { user }     = useAuth();

  const { data: profile } = useQuery<StaffProfileData>({
    queryKey: ["/api/staff/me/profile"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: stripeStatus } = useQuery<StripeStatus>({
    queryKey: ["/api/staff/me/stripe-status"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/stripe-status", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const staffColor  = profile?.color ?? "#3b82f6";
  const initials    = (profile?.name?.[0] ?? user?.firstName?.[0] ?? "S").toUpperCase();
  const displayName = profile?.name ?? user?.firstName ?? "Staff";

  const needsPayoutSetup =
    !!stripeStatus?.hasContractorRecord &&
    !!stripeStatus?.stripeConfigured &&
    (stripeStatus?.onboardingStatus !== "complete" || !stripeStatus?.bankVerified);

  const isFullyOnboarded =
    !!stripeStatus?.hasContractorRecord &&
    !!stripeStatus?.stripeConfigured &&
    stripeStatus?.onboardingStatus === "complete" &&
    !!stripeStatus?.bankVerified;

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch { /* ignore */ }
    queryClient.clear();
    if (typeof window !== "undefined") localStorage.removeItem("booking_user_session");
    navigate("/staff-auth", { replace: true });
  };

  const rows: MenuRow[] = [
    {
      icon: DollarSign,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      label: "My Pay",
      onPress: () => navigate("/staff-pay"),
    },
    // Financial Hub — only shown once fully onboarded; replaces the basic payout entry
    ...(isFullyOnboarded ? [{
      icon: LayoutDashboard,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      label: "Financial Hub",
      onPress: () => navigate("/staff-financial-hub"),
    }] : []),
    {
      icon: CreditCard,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      label: isFullyOnboarded ? "Payout Settings" : "Payout Account",
      onPress: () => navigate("/staff-payouts"),
      badge: needsPayoutSetup,
    },
    {
      icon: Receipt,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-500",
      label: "Income & Earnings",
      onPress: () => navigate("/staff-income"),
    },
    {
      icon: Settings2,
      iconBg: "bg-gray-100",
      iconColor: "text-gray-500",
      label: "Account Information",
      onPress: () => navigate("/staff-profile"),
    },
    {
      icon: Globe,
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-500",
      label: "Language",
      onPress: () => navigate("/staff-language"),
    },
    {
      icon: LogOut,
      iconBg: "bg-red-50",
      iconColor: "text-red-400",
      label: "Logout",
      onPress: handleLogout,
      danger: true,
    },
  ];

  return (
    <div className="flex flex-col bg-white overflow-hidden" style={{ height: "100dvh" }}>
      <div className="flex-1 overflow-y-auto">
        {/* ── Avatar + name ───────────────────────────────────────────────── */}
        <div className="flex flex-col items-center pt-16 pb-8">
          <div
            className="w-20 h-20 rounded-full border-4 flex items-center justify-center text-3xl font-bold"
            style={{ borderColor: staffColor, color: staffColor, backgroundColor: `${staffColor}14` }}
          >
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" className="w-full h-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <p className="mt-3 text-xl font-bold text-gray-900">{displayName}</p>
        </div>

        {/* ── Menu rows ─────────────────────────────────────────────────────── */}
        <div className="px-5 space-y-3">
          {rows.map((row) => (
            <button
              key={row.label}
              onClick={row.onPress}
              className="w-full flex items-center gap-4 bg-gray-50 rounded-2xl px-4 py-4 active:bg-gray-100 transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${row.iconBg}`}>
                <row.icon className={`w-5 h-5 ${row.iconColor}`} strokeWidth={1.8} />
              </div>
              <span className={`flex-1 text-left text-[16px] font-semibold ${row.danger ? "text-red-500" : "text-gray-800"}`}>
                {row.label}
              </span>
              {row.badge && (
                <span className="relative flex h-2.5 w-2.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <StaffPortalNav />
    </div>
  );
}
