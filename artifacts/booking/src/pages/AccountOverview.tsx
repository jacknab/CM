import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Calendar, Globe, CreditCard,
  Settings, ExternalLink, AlertTriangle, Zap,
  MapPin, Phone, Copy, Check, LogOut,
  ChevronRight, Users, Scissors, BarChart3,
  ShoppingBag, Star, Shield, HelpCircle, MessageSquare,
  Smartphone, Trash2, X, Eye, EyeOff,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { useFeatureFlags } from "@/hooks/use-features";
import { cn } from "@/lib/utils";
import { formatInTz } from "@/lib/timezone";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManageOverview {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
  };
  salonos: {
    stores: Array<{
      id: number;
      name: string;
      bookingSlug: string | null;
      timezone: string | null;
      phone: string | null;
      address: string | null;
    }>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PLAN_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  active:    { label: "Active",    color: "text-emerald-700", dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200" },
  trialing:  { label: "Free Trial", color: "text-violet-700", dot: "bg-violet-500",  bg: "bg-violet-50 border-violet-200" },
  trial:     { label: "Free Trial", color: "text-violet-700", dot: "bg-violet-500",  bg: "bg-violet-50 border-violet-200" },
  past_due:  { label: "Past Due",  color: "text-red-700",     dot: "bg-red-500",     bg: "bg-red-50 border-red-200" },
  canceled:  { label: "Canceled",  color: "text-gray-500",    dot: "bg-gray-400",    bg: "bg-gray-100 border-gray-200" },
  cancelled: { label: "Canceled",  color: "text-gray-500",    dot: "bg-gray-400",    bg: "bg-gray-100 border-gray-200" },
  unpaid:    { label: "Unpaid",    color: "text-orange-700",  dot: "bg-orange-500",  bg: "bg-orange-50 border-orange-200" },
  none:      { label: "No Plan",   color: "text-gray-500",    dot: "bg-gray-300",    bg: "bg-gray-100 border-gray-200" },
};

function getPlanCfg(s: string | null | undefined) {
  return PLAN_CONFIG[s ?? "none"] ?? PLAN_CONFIG["none"];
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

/**
 * Format a UTC date string using the salon's IANA timezone.
 * Never use .toLocaleDateString() — it applies the browser/server TZ, not the salon TZ.
 */
function formatDate(dateStr: string | null | undefined, timezone: string): string {
  if (!dateStr) return "";
  return formatInTz(new Date(dateStr), timezone, "MMMM d, yyyy");
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handle}
      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  );
}

// ─── Delete Account Modal ─────────────────────────────────────────────────────
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"confirm" | "form">("confirm");
  const [password, setPassword] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const phraseRef = useRef<HTMLInputElement>(null);

  async function handleDelete() {
    setError("");
    if (confirmPhrase !== "DELETE") {
      setError("Please type DELETE exactly to confirm.");
      phraseRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPhrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Failed to delete account.");
        setLoading(false);
        return;
      }
      // Redirect to marketing site after deletion
      window.location.href = "/overview";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-red-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Delete Account</h2>
          </div>
          <button onClick={onClose} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {step === "confirm" ? (
          <div className="px-6 py-5 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-semibold text-red-800">This action cannot be undone</p>
              <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                <li>Your account access will be removed immediately</li>
                <li>All your salon data, clients, and appointments will no longer be accessible</li>
                <li>Active subscriptions will be cancelled</li>
                <li>Financial records are retained per our legal obligations</li>
              </ul>
            </div>
            <p className="text-sm text-gray-500">
              Before deleting, we recommend <strong className="text-gray-700">exporting your data</strong> from your dashboard.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => setStep("form")} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors">
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-500">Enter your password and type <strong className="font-mono text-gray-800">DELETE</strong> to confirm.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your current password"
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type <span className="font-mono">DELETE</span> to confirm</label>
                <input
                  ref={phraseRef}
                  type="text"
                  value={confirmPhrase}
                  onChange={e => setConfirmPhrase(e.target.value.toUpperCase())}
                  placeholder="DELETE"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setStep("confirm")} disabled={loading} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmPhrase !== "DELETE" || !password}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {loading ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountOverview() {
  const { user: authUser, logout, isLoggingOut } = useAuth();
  const { selectedStore } = useSelectedStore();
  const features = useFeatureFlags();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data, isLoading } = useQuery<ManageOverview>({
    queryKey: ["/api/manage/overview"],
    queryFn: async () => {
      const res = await fetch("/api/manage/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
  });

  const user = data?.user;
  const stores = data?.salonos?.stores ?? [];
  const primaryStore = stores[0] ?? null;

  const displayName = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email)
    : (authUser ? `${authUser.firstName ?? ""} ${authUser.lastName ?? ""}`.trim() || authUser.email : "");

  const initials = user
    ? ([user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || (user.email[0] ?? "U").toUpperCase())
    : (authUser ? (authUser.firstName?.[0] ?? authUser.email?.[0] ?? "U").toUpperCase() : "U");

  const email = user?.email ?? authUser?.email ?? "";
  const subStatus = user?.subscriptionStatus ?? null;
  const planCfg = getPlanCfg(subStatus);
  const trialDays = daysUntil(user?.trialEndsAt);
  const isTrialing = subStatus === "trialing" || subStatus === "trial";
  const isPastDue = subStatus === "past_due";
  const hasNoPlan = !subStatus || subStatus === "none";
  const bookingUrl = primaryStore?.bookingSlug
    ? `${window.location.origin}/book/${primaryStore.bookingSlug}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-24">

        {/* ── Identity header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary flex-shrink-0 ring-2 ring-primary/20">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary/40" /> : initials}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                {isLoading ? "Loading…" : displayName}
              </h1>
              <p className="text-sm text-gray-400">{email}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{isLoggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>

        {/* ── Alert banners ───────────────────────────────────────────────────── */}
        {isPastDue && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-800 text-sm font-semibold">Payment past due</p>
              <p className="text-red-500 text-xs mt-0.5">Update your payment method to keep your account active.</p>
            </div>
            <Link to="/billing" className="text-xs font-semibold bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              Fix now
            </Link>
          </div>
        )}
        {isTrialing && trialDays !== null && trialDays <= 14 && (
          <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-2xl p-4">
            <Zap className="w-5 h-5 text-violet-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-violet-800 text-sm font-semibold">
                {trialDays <= 0 ? "Your trial has ended" : `${trialDays} day${trialDays === 1 ? "" : "s"} left in your free trial`}
              </p>
              <p className="text-violet-500 text-xs mt-0.5">Add a payment method to keep everything running smoothly.</p>
            </div>
            <Link to="/billing" className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              Subscribe
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : (
          <>
            {/* ── Plan & Subscription ─────────────────────────────────────────── */}
            <div>
              <SectionLabel>Your Plan</SectionLabel>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">
                        {isTrialing ? "Free Trial" : subStatus === "active" ? "SalonOS Pro" : hasNoPlan ? "No active plan" : planCfg.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isTrialing && trialDays !== null
                          ? trialDays > 0
                            ? `Expires ${formatDate(user?.trialEndsAt, selectedStore?.timezone ?? primaryStore?.timezone ?? "UTC")}`
                            : "Trial expired"
                          : subStatus === "active"
                          ? "Renews monthly"
                          : hasNoPlan
                          ? "Choose a plan to get started"
                          : planCfg.label}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
                    planCfg.bg, planCfg.color
                  )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", planCfg.dot)} />
                    {planCfg.label}
                  </span>
                </div>
                <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50/60">
                  <p className="text-xs text-gray-400">{email}</p>
                  <Link
                    to="/billing"
                    className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                  >
                    {hasNoPlan || isTrialing ? "Choose a plan" : "Manage billing"}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ── My Salon ────────────────────────────────────────────────────── */}
            <div>
              <SectionLabel>My Salon</SectionLabel>
              {primaryStore ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-base">{primaryStore.name}</p>
                        {primaryStore.address && (
                          <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />
                            {primaryStore.address}
                          </p>
                        )}
                        {primaryStore.phone && (
                          <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />
                            {primaryStore.phone}
                          </p>
                        )}
                      </div>
                      <Link
                        to="/dashboard"
                        className="flex-shrink-0 text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Dashboard
                      </Link>
                    </div>

                    {bookingUrl && (
                      <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-500 truncate font-mono">{bookingUrl}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <CopyButton text={bookingUrl} />
                          <a
                            href={bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {stores.length > 1 && (
                    <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/60">
                      <p className="text-xs text-gray-400">{stores.length} locations total</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center">
                  <Scissors className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-500">No salon set up yet</p>
                  <p className="text-xs text-gray-400 mt-1 mb-4">Complete setup to unlock booking, calendar, and more.</p>
                  <Link
                    to="/onboarding"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg transition-colors"
                  >
                    Complete setup
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* ── Quick Actions ───────────────────────────────────────────────── */}
            <div>
              <SectionLabel>Quick access</SectionLabel>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {[
                  { label: "Calendar",        to: "/calendar",        icon: Calendar },
                  { label: "Clients",          to: "/customers",       icon: Users },
                  { label: "Services",         to: "/services",        icon: Scissors },
                  { label: "Online Booking",   to: "/online-booking",  icon: Smartphone },
                  { label: "Analytics",        to: "/analytics",       icon: BarChart3 },
                  { label: "Products",         to: "/products",        icon: ShoppingBag },
                  ...(features.rewardPoints ? [{ label: "Loyalty",  to: "/loyalty",  icon: Star }] : []),
                  { label: "Website",          to: "/website-builder", icon: Globe },
                ].map(({ label, to, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="group flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white border border-gray-100 hover:border-primary/20 hover:bg-primary/3 shadow-sm transition-all"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <Icon className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-gray-500 group-hover:text-gray-900 text-center leading-tight transition-colors">
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* ── Account settings ────────────────────────────────────────────── */}
            <div>
              <SectionLabel>Account</SectionLabel>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100 overflow-hidden">
                {[
                  { label: "Business Settings",  sublabel: "Name, address, hours, timezone",   to: "/business-settings",  icon: Settings },
                  { label: "Billing & Plan",      sublabel: "Subscription, invoices, payment",  to: "/billing",            icon: CreditCard },
                  { label: "Staff & Earnings",    sublabel: "Team members, commissions",        to: "/payouts/contractors", icon: Users },
                  { label: "SMS Inbox",           sublabel: "Client messages",                  to: "/sms-inbox",          icon: MessageSquare },
                  { label: "Privacy & Security",  sublabel: "Password, account data",           to: "/business-settings",  icon: Shield },
                  { label: "Help & Support",      sublabel: "Articles, contact us",             to: "/help",               icon: HelpCircle },
                ].map(({ label, sublabel, to, icon: Icon }) => (
                  <Link
                    key={to + label}
                    to={to}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-colors">
                      <Icon className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>

            {/* ── Sign out footer ─────────────────────────────────────────────── */}
            <div className="pt-2">
              <button
                onClick={() => logout()}
                disabled={isLoggingOut}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                {isLoggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>

            {/* ── Danger zone ─────────────────────────────────────────────────── */}
            <div className="pt-2 pb-4">
              <SectionLabel>Danger zone</SectionLabel>
              <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Delete my account</p>
                    <p className="text-xs text-gray-400 mt-0.5">Permanently remove your account and cancel all services</p>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex-shrink-0 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showDeleteModal && <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />}
    </AppLayout>
  );
}
