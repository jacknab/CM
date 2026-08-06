import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ExternalLink, RefreshCw, MoreHorizontal,
  LogIn, Zap, Activity, Mail, Shield, Copy, CheckCircle2,
} from "lucide-react";
import { api, type AccountOverview } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import AccountSummaryCard from "@/components/customer360/AccountSummaryCard";
import HealthStatusCard from "@/components/customer360/HealthStatusCard";
import SubscriptionCard from "@/components/customer360/SubscriptionCard";
import InternalNotesCard from "@/components/customer360/InternalNotesCard";
import QuickStatsCard from "@/components/customer360/QuickStatsCard";
import AIUsageCard from "@/components/customer360/AIUsageCard";
import AIReceptionistTab from "@/components/customer360/AIReceptionistTab";
import RecentTicketsCard from "@/components/customer360/RecentTicketsCard";
import CustomerActionsCard from "@/components/customer360/CustomerActionsCard";
import ActivityTimeline from "@/components/customer360/ActivityTimeline";
import BookingSystemTab from "@/components/customer360/BookingSystemTab";
import WebsiteTab from "@/components/customer360/WebsiteTab";
import CommunicationsTab from "@/components/customer360/CommunicationsTab";
import BillingTab from "@/components/customer360/BillingTab";
import HealthCheckTab from "@/components/customer360/HealthCheckTab";
import { format } from "date-fns";

const TABS = [
  { id: "Overview",         label: "Overview" },
  { id: "Activity",         label: "Activity" },
  { id: "Health Check",     label: "Health Check" },
  { id: "Billing",          label: "Billing" },
  { id: "AI Receptionist",  label: "AI Receptionist" },
  { id: "Booking System",   label: "Booking" },
  { id: "Website",          label: "Website" },
  { id: "Communications",   label: "Communications" },
  { id: "Tickets",          label: "Tickets" },
  { id: "Notes & History",  label: "Notes" },
];

// ── Tiny status badge for the header risk/tier indicators
function MetaBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-right">
      <div className={`text-sm font-semibold ${color ?? "text-slate-800"}`}>{value}</div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export default function Customer360Page() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("Overview");
  const [copied, setCopied] = useState(false);
  const accountId = parseInt(id ?? "0");

  const { data: overview, isLoading, error } = useQuery<AccountOverview>({
    queryKey: ["support-account-overview", accountId],
    queryFn: () => api.accounts.overview(accountId),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] });

  const copyId = () => {
    navigator.clipboard.writeText(String(accountId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !overview) return (
    <div className="p-6 text-center">
      <p className="text-slate-500">Account not found or failed to load.</p>
      <button onClick={() => navigate("/accounts")} className="mt-3 text-indigo-600 hover:underline text-sm">
        Back to Search
      </button>
    </div>
  );

  const { store, owner, subscription, stats, health } = overview;
  const initials = [owner.firstName?.[0], owner.lastName?.[0]].filter(Boolean).join("").toUpperCase() || store.name[0].toUpperCase();
  const mrr = subscription?.priceCents ? (subscription.priceCents / 100).toFixed(2) : "0.00";
  const signupDate = owner.signupDate ? format(new Date(owner.signupDate), "MMM d, yyyy") : "—";

  // Derive risk level from health score
  const healthServices = Object.values(health);
  const healthScore = Math.round((healthServices.filter(v => v === "online" || v === "connected" || v === "secure" || v === "operational").length / healthServices.length) * 100);
  const riskLevel = healthScore >= 80 ? "LOW" : healthScore >= 50 ? "MEDIUM" : "HIGH";
  const riskColor = healthScore >= 80 ? "text-emerald-600" : healthScore >= 50 ? "text-amber-600" : "text-red-600";

  const isSuspended = store.accountStatus === "Suspended";
  const isTrialing  = owner.subscriptionStatus === "trialing" || owner.subscriptionStatus === "trial";

  // Activity tab fills the full available height — no extra padding
  const isFullHeightTab = activeTab === "Activity";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* ── Sticky Account Header ───────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0 flex-shrink-0">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => navigate("/accounts")}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm transition"
          >
            <ArrowLeft size={14} />
            Accounts
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 text-sm font-medium">{store.name}</span>
        </div>

        {/* Account Identity Bar */}
        <div className="flex items-start gap-5 pb-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20">
              {initials}
            </div>
            {/* Online indicator */}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${isSuspended ? "bg-red-500" : "bg-emerald-400"}`} />
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{store.name}</h1>
              <StatusBadge status={store.accountStatus ?? "Unknown"} size="sm" />
              {isTrialing && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  TRIAL
                </span>
              )}
              {store.category && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{store.category}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
              {store.bookingSlug && (
                <a href={`https://book.certxa.com/${store.bookingSlug}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-600 hover:underline">
                  book.certxa.com/{store.bookingSlug}
                  <ExternalLink size={10} />
                </a>
              )}
              <button
                onClick={copyId}
                className="flex items-center gap-1 hover:text-slate-700 transition"
                title="Copy account ID"
              >
                {copied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
                Account #{store.id}
              </button>
              {owner.email && <span>{owner.email}</span>}
              {owner.lastLoginAt && (
                <span className="text-slate-400">
                  Last login: {format(new Date(owner.lastLoginAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="hidden xl:flex items-start gap-6 text-right flex-shrink-0">
            <MetaBadge label="Plan"      value={subscription?.planName ?? "No Plan"} />
            <MetaBadge label="MRR"       value={`$${mrr}`} />
            <MetaBadge label="Signed Up" value={signupDate} />
            <MetaBadge label="Health"    value={`${healthScore}%`} color={riskColor} />
            <MetaBadge label="Risk"      value={riskLevel} color={riskColor} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setActiveTab("Activity")}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 text-slate-700 rounded-lg text-xs font-medium transition"
              title="View full Activity Timeline"
            >
              <Activity size={12} />
              Activity
            </button>
            <button
              onClick={() => setActiveTab("Communications")}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 text-slate-700 rounded-lg text-xs font-medium transition"
              title="Send email to owner"
            >
              <Mail size={12} />
              Email
            </button>
            <button
              onClick={() => {
                // Opens CustomerActionsCard in the Overview tab impersonate flow
                setActiveTab("Overview");
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition"
              title="Open action panel"
            >
              <Shield size={12} />
              Actions
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
            <button className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition">
              <MoreHorizontal size={13} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────────── */}
      <div className={`flex-1 overflow-hidden ${isFullHeightTab ? "" : "overflow-y-auto scrollbar-thin bg-slate-50"}`}>

        {/* ─── Overview ─────────────────────────────────────────────────────── */}
        {activeTab === "Overview" && (
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="space-y-5">
                <AccountSummaryCard store={store} owner={owner} />
                <SubscriptionCard subscription={subscription} />
                <InternalNotesCard accountId={accountId} />
              </div>
              <div className="space-y-5">
                <HealthStatusCard health={health} />
                <QuickStatsCard stats={stats} />
                <AIUsageCard stats={stats} />
              </div>
              <div className="space-y-5">
                <CustomerActionsCard accountId={accountId} store={store} owner={owner} subscription={subscription} />
                <RecentTicketsCard accountId={accountId} />
              </div>
            </div>
          </div>
        )}

        {/* ─── Activity ─────────────────────────────────────────────────────── */}
        {activeTab === "Activity" && (
          <ActivityTimeline accountId={accountId} overview={overview} />
        )}

        {/* ─── Health Check ─────────────────────────────────────────────────── */}
        {activeTab === "Health Check" && (
          <HealthCheckTab accountId={accountId} />
        )}

        {/* ─── Billing ──────────────────────────────────────────────────────── */}
        {activeTab === "Billing" && (
          <BillingTab
            accountId={accountId}
            subscription={subscription}
            owner={owner}
            store={store}
          />
        )}

        {/* ─── AI Receptionist ──────────────────────────────────────────────── */}
        {activeTab === "AI Receptionist" && (
          <div className="p-6 max-w-5xl">
            <AIReceptionistTab accountId={accountId} />
          </div>
        )}

        {/* ─── Booking System ───────────────────────────────────────────────── */}
        {activeTab === "Booking System" && (
          <BookingSystemTab accountId={accountId} />
        )}

        {/* ─── Website ──────────────────────────────────────────────────────── */}
        {activeTab === "Website" && (
          <WebsiteTab accountId={accountId} />
        )}

        {/* ─── Communications ───────────────────────────────────────────────── */}
        {activeTab === "Communications" && (
          <CommunicationsTab
            accountId={accountId}
            ownerEmail={owner.email}
            ownerFirstName={owner.firstName}
          />
        )}

        {/* ─── Tickets ──────────────────────────────────────────────────────── */}
        {activeTab === "Tickets" && (
          <div className="p-6 max-w-4xl">
            <RecentTicketsCard accountId={accountId} showCreate />
          </div>
        )}

        {/* ─── Notes & History ──────────────────────────────────────────────── */}
        {activeTab === "Notes & History" && (
          <div className="p-6 max-w-3xl">
            <InternalNotesCard accountId={accountId} full />
          </div>
        )}
      </div>
    </div>
  );
}
