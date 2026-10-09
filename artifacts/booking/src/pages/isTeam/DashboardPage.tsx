import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { supportApi, type SearchResult } from "@/lib/support-api";
import { StatusBadge } from "@/components/isTeam/ui/StatusBadge";

// One page behind the four Accounts links in the sidebar. The ?status= on the link picks the list.
const VIEWS: Record<string, { status: string; title: string; subtitle: string; empty: string }> = {
  "":        { status: "all",       title: "Search Accounts",  subtitle: "Find any customer account by name, email, phone, or account ID", empty: "No accounts yet." },
  Active:    { status: "active",    title: "Active Accounts",  subtitle: "Accounts that are not suspended. Accounts on a free trial are included.", empty: "No active accounts." },
  Trial:     { status: "trial",     title: "Trials",           subtitle: "Accounts whose owner is on a free trial.", empty: "No accounts on a trial." },
  Suspended: { status: "suspended", title: "Suspended",        subtitle: "Accounts that have been suspended.", empty: "No suspended accounts." },
};

const day = (value: string | null) => (value ? format(new Date(value), "MMM d, yyyy") : "—");

function billingOf(a: SearchResult): { title: string; detail: string | null } {
  if (a.subscriptionStatus === "trial") {
    return { title: "Free trial", detail: a.trialEndsAt ? `Ends ${day(a.trialEndsAt)}` : null };
  }
  if (a.subscriptionStatus === "expired") {
    return { title: "Trial expired", detail: a.trialEndsAt ? `Ended ${day(a.trialEndsAt)}` : null };
  }
  return {
    title: a.planName ?? "No plan",
    detail: a.priceCents ? `$${(a.priceCents / 100).toFixed(2)}` : null,
  };
}

export default function TeamDashboardPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const view = VIEWS[params.get("status") ?? ""] ?? VIEWS[""];

  const { data: accounts, isLoading, error, refetch, isFetching } = useQuery<SearchResult[]>({
    queryKey: ["support-account-list", view.status],
    queryFn: () => supportApi.accounts.list(view.status),
    staleTime: 30_000,
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{view.title}</h1>
            <p className="text-slate-500 text-sm mt-1">{view.subtitle}</p>
          </div>
          <button onClick={() => refetch()} className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition bg-white">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {isLoading && <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 className="w-5 h-5 animate-spin" /> Loading accounts…</div>}
        {error && <div className="text-sm text-red-600">Could not load accounts.</div>}

        {accounts && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">{view.title} ({accounts.length})</h3>
            </div>
            {accounts.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">{view.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500">
                      <th className="px-4 py-2 font-medium">Account</th>
                      <th className="px-4 py-2 font-medium">Owner</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Plan</th>
                      <th className="px-4 py-2 font-medium">Signed up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => {
                      const billing = billingOf(a);
                      return (
                        <tr
                          key={a.id}
                          onClick={() => navigate(`/isTeam/accounts/${a.id}`)}
                          className="border-t border-slate-100 align-top cursor-pointer hover:bg-slate-50 transition"
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-indigo-600">{a.businessName || `Account #${a.id}`}</div>
                            <div className="text-slate-500">
                              #{a.id}
                              {[a.city, a.state].filter(Boolean).length > 0 ? ` · ${[a.city, a.state].filter(Boolean).join(", ")}` : ""}
                            </div>
                            {a.category && <div className="text-slate-400">{a.category}</div>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{a.ownerName || "—"}</div>
                            <div className="text-slate-500">{a.ownerEmail}</div>
                            {a.phone && <div className="text-slate-500">{a.phone}</div>}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={a.accountStatus ?? "Unknown"} size="xs" /></td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="text-slate-800">{billing.title}</div>
                            {billing.detail && <div className="text-slate-500">{billing.detail}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{day(a.signupDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
