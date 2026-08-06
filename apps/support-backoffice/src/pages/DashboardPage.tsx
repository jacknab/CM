import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, ChevronRight, ChevronLeft, Users } from "lucide-react";
import { clsx } from "clsx";
import { formatDistanceToNow } from "date-fns";

const BASE = "/api/support";
const req = (path: string) =>
  fetch(`${BASE}${path}`, { credentials: "include" }).then(r => r.json());

interface Account {
  id: number;
  name: string;
  account_status: string;
  account_id: string | null;
  owner_email: string;
  first_name: string;
  last_name: string;
  plan_code: string | null;
  plan_name: string | null;
  price_cents: number | null;
  sub_status: string | null;
  current_period_end: string | null;
  failed_payments: number;
  overdue_cents: number;
}

const STATUS_FILTERS = [
  { value: "all",       label: "All" },
  { value: "Active",    label: "Active" },
  { value: "Trial",     label: "Trial" },
  { value: "Suspended", label: "Suspended" },
  { value: "Canceled",  label: "Canceled" },
  { value: "Past Due",  label: "Past Due" },
];

const PLAN_STYLE: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-700",
  trialing: "bg-sky-100 text-sky-700",
  past_due: "bg-orange-100 text-orange-700",
  canceled: "bg-slate-100 text-slate-500",
  paused:   "bg-amber-100 text-amber-700",
};

const ACCOUNT_STATUS_STYLE: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  trial:     "bg-sky-100 text-sky-700 border-sky-200",
  "past due":"bg-orange-100 text-orange-700 border-orange-200",
  suspended: "bg-red-100 text-red-700 border-red-200",
  canceled:  "bg-slate-100 text-slate-500 border-slate-200",
};

function AccountStatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? "").toLowerCase();
  const cls = ACCOUNT_STATUS_STYLE[key] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full border", cls)}>
      {status ?? "Unknown"}
    </span>
  );
}

function PlanBadge({ subStatus }: { subStatus?: string | null }) {
  if (!subStatus) return null;
  const cls = PLAN_STYLE[subStatus] ?? "bg-slate-100 text-slate-500";
  return (
    <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded-full", cls)}>
      {subStatus}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read status from URL param (so sidebar nav links work)
  const urlStatus = searchParams.get("status") ?? "all";

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [page, setPage] = useState(0);

  // Keep statusFilter in sync when sidebar nav link changes the URL
  useEffect(() => {
    setStatusFilter(urlStatus);
    setPage(0);
  }, [urlStatus]);

  // Update URL when filter changes (keeps browser history / nav links in sync)
  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(0);
    if (val === "all") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ status: val }, { replace: true });
    }
  };

  const offset = page * PAGE_SIZE;
  const qs = new URLSearchParams({ q: submittedQ, status: statusFilter, limit: String(PAGE_SIZE), offset: String(offset) });

  const { data, isLoading } = useQuery({
    queryKey: ["accounts-list", submittedQ, statusFilter, page],
    queryFn: () => req(`/billing-search?${qs}`),
    staleTime: 30_000,
  });

  const accounts: Account[] = data?.accounts ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQ(q.trim());
    setPage(0);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Accounts</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {total > 0 ? `${total.toLocaleString()} account${total !== 1 ? "s" : ""}` : "All customer accounts"}
            </p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by name, email, slug…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => handleStatusChange(f.value)}
                className={clsx(
                  "px-3 py-1.5 text-xs rounded-lg font-medium transition",
                  statusFilter === f.value
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 border border-slate-200 bg-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-[1fr_200px_130px_130px_36px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
            {["Account", "Plan", "Status", "Member Since", ""].map(h => (
              <div key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</div>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Building2 size={36} className="text-slate-200 mb-3" />
              <p className="text-slate-500 font-medium">No accounts found</p>
              <p className="text-slate-400 text-xs mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {accounts.map(a => {
                const displayId = a.account_id ?? `#${String(a.id).padStart(5, "0")}`;
                const ownerName = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.owner_email;
                const price = a.price_cents ? `$${(a.price_cents / 100).toFixed(0)}/mo` : null;

                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/accounts/${a.id}`)}
                    className="w-full grid grid-cols-[1fr_200px_130px_130px_36px] gap-4 px-5 py-3.5 hover:bg-indigo-50/40 transition text-left items-center group"
                  >
                    {/* Account */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition truncate leading-none">
                        {a.name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {displayId} · {a.owner_email}
                      </p>
                    </div>

                    {/* Plan */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {a.plan_name ?? "—"}
                        </span>
                        {a.sub_status && <PlanBadge subStatus={a.sub_status} />}
                      </div>
                      {price && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{price}</p>
                      )}
                    </div>

                    {/* Account Status */}
                    <div>
                      <AccountStatusBadge status={a.account_status} />
                    </div>

                    {/* Member Since (using current_period_end as rough proxy; show "—" when not available) */}
                    <div className="text-xs text-slate-400">
                      {a.current_period_end
                        ? formatDistanceToNow(new Date(a.current_period_end), { addSuffix: true })
                        : "—"}
                    </div>

                    {/* Arrow */}
                    <div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-xs text-slate-500">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={12} /> Prev
              </button>
              <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
