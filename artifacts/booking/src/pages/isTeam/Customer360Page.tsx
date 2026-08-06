import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, RefreshCw, MoreHorizontal, Wallet, Clock } from "lucide-react";
import { supportApi, type AccountOverview } from "@/lib/support-api";
import { StatusBadge } from "@/components/isTeam/ui/StatusBadge";
import AccountSummaryCard from "@/components/isTeam/customer360/AccountSummaryCard";
import HealthStatusCard from "@/components/isTeam/customer360/HealthStatusCard";
import SubscriptionCard from "@/components/isTeam/customer360/SubscriptionCard";
import InternalNotesCard from "@/components/isTeam/customer360/InternalNotesCard";
import QuickStatsCard from "@/components/isTeam/customer360/QuickStatsCard";
import AIUsageCard from "@/components/isTeam/customer360/AIUsageCard";
import RecentTicketsCard from "@/components/isTeam/customer360/RecentTicketsCard";
import CustomerActionsCard from "@/components/isTeam/customer360/CustomerActionsCard";
import ActivityTimeline from "@/components/isTeam/customer360/ActivityTimeline";
import HealthCheckTab from "@/components/isTeam/customer360/HealthCheckTab";
import BookingSystemTab from "@/components/isTeam/customer360/BookingSystemTab";
import WebsiteTab from "@/components/isTeam/customer360/WebsiteTab";
import CommunicationsTab from "@/components/isTeam/customer360/CommunicationsTab";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

function useLocalTime(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  try {
    return {
      time: formatInTimeZone(now, timezone, "h:mm:ss a"),
      date: formatInTimeZone(now, timezone, "EEE, MMM d yyyy"),
    };
  } catch {
    return { time: "—", date: "—" };
  }
}

const TABS = ["Overview", "Activity", "Account Diagnostics", "Billing", "AI Receptionist", "Booking System", "Website", "Communications", "Tickets", "Notes & History", "Files"];

export default function TeamCustomer360Page() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("Overview");
  const accountId = parseInt(id ?? "0");

  const { data: overview, isLoading, error } = useQuery<AccountOverview>({
    queryKey: ["support-account-overview", accountId],
    queryFn: () => supportApi.accounts.overview(accountId),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const timezoneForClock = overview?.store?.timezone ?? "UTC";
  const localTime = useLocalTime(timezoneForClock);

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !overview) return (
    <div className="p-6 text-center">
      <p className="text-slate-500">Account not found or failed to load.</p>
      <button onClick={() => navigate("/isTeam/accounts")} className="mt-3 text-indigo-600 hover:underline text-sm">Back to Search</button>
    </div>
  );

  const { store, owner, subscription, stats, health } = overview;
  const initials = [owner.firstName?.[0], owner.lastName?.[0]].filter(Boolean).join("").toUpperCase() || store.name[0]?.toUpperCase() || "?";
  const mrr = subscription?.priceCents ? (subscription.priceCents / 100).toFixed(2) : "0.00";
  const signupDate = owner.signupDate ? format(new Date(owner.signupDate), "MMM d, yyyy") : "—";
  const isFullHeightTab = activeTab === "Activity";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate("/isTeam/accounts")} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm transition">
            <ArrowLeft size={14} />Accounts
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 text-sm font-medium">{store.name}</span>
        </div>

        <div className="flex items-start gap-5 pb-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg shadow-indigo-500/20">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{store.name}</h1>
              <StatusBadge status={store.accountStatus ?? "Unknown"} size="sm" />
              {store.category && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{store.category}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-slate-500">
              {store.bookingSlug && (
                <a href={`https://book.certxa.com/${store.bookingSlug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 hover:underline">
                  book.certxa.com/{store.bookingSlug}<ExternalLink size={10} />
                </a>
              )}
              <span>Account ID #{store.id}</span>
              {owner.email && <span>{owner.email}</span>}
            </div>
          </div>

          <div className="hidden lg:flex items-start gap-6 text-right flex-shrink-0">
            {[
              { label: "Plan",     value: subscription?.planName ?? "—" },
              { label: "MRR",      value: `$${mrr}` },
              { label: "Signed Up",value: signupDate },
            ].map(m => (
              <div key={m.label}>
                <div className="text-sm font-semibold text-slate-800">{m.value}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{m.label}</div>
              </div>
            ))}
            <div>
              <div className="flex items-center justify-end gap-1 text-sm font-semibold text-slate-800">
                <Wallet size={13} className="text-emerald-500" />
                ${(parseFloat(store.platformCredits ?? "0") || 0).toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Wallet</div>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <div className="flex items-center justify-end gap-1 text-sm font-semibold text-slate-800 tabular-nums">
                <Clock size={13} className="text-slate-400" />
                {localTime.time}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 text-right">{localTime.date}</div>
              <div className="text-[9px] text-slate-300 mt-0.5 text-right">{store.timezone ?? "UTC"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleRefresh} className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition"><RefreshCw size={13} /></button>
            <button className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition"><MoreHorizontal size={13} /></button>
          </div>
        </div>

        <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-thin">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition ${
                activeTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-hidden ${isFullHeightTab ? "" : "overflow-y-auto scrollbar-thin bg-slate-50"}`}>
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
        {activeTab === "Activity" && <ActivityTimeline accountId={accountId} overview={overview} />}
        {activeTab === "Account Diagnostics" && <HealthCheckTab accountId={accountId} />}
        {activeTab === "Billing" && (
          <div className="p-6 max-w-3xl">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Billing Details</h2>
            <SubscriptionCard subscription={subscription} full />
          </div>
        )}
        {activeTab === "AI Receptionist" && (
          <div className="p-6 max-w-3xl">
            <h2 className="text-base font-semibold text-slate-800 mb-4">AI Receptionist Usage</h2>
            <AIUsageCard stats={stats} full />
          </div>
        )}
        {activeTab === "Tickets" && (
          <div className="p-6 max-w-3xl">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Support Tickets</h2>
            <RecentTicketsCard accountId={accountId} showCreate />
          </div>
        )}
        {activeTab === "Notes & History" && (
          <div className="p-6 max-w-3xl">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Notes & History</h2>
            <InternalNotesCard accountId={accountId} full />
          </div>
        )}
        {activeTab === "Booking System" && (
          <BookingSystemTab accountId={accountId} bookingSlug={store.bookingSlug ?? null} />
        )}
        {activeTab === "Website" && (
          <WebsiteTab accountId={accountId} />
        )}
        {activeTab === "Communications" && (
          <CommunicationsTab accountId={accountId} />
        )}
        {!["Overview", "Activity", "Account Diagnostics", "Billing", "AI Receptionist", "Booking System", "Website", "Communications", "Tickets", "Notes & History"].includes(activeTab) && (
          <div className="p-6 flex items-center justify-center h-64">
            <p className="text-slate-400 text-sm">{activeTab} — coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
