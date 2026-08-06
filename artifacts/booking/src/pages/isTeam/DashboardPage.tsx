import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, ChevronRight, Phone, Mail } from "lucide-react";
import { supportApi, type SearchResult } from "@/lib/support-api";
import { StatusBadge } from "@/components/isTeam/ui/StatusBadge";
import { formatDistanceToNow } from "date-fns";

export default function TeamDashboardPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dq, setDq] = useState("");

  const { data: results = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ["support-search", dq],
    queryFn: () => supportApi.search(dq),
    enabled: dq.trim().length >= 2,
    staleTime: 15_000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDq(query.trim());
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Search Accounts</h1>
        <p className="text-slate-500 text-sm mt-1">Find any customer account by name, email, phone, or account ID</p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by business name, owner, email, phone, account ID…"
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              autoFocus />
          </div>
          <button type="submit" className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition">Search</button>
        </div>
      </form>

      {isLoading && (
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Searching…
        </div>
      )}

      {!isLoading && dq && results.length === 0 && (
        <div className="text-center py-16">
          <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No accounts found</p>
          <p className="text-slate-400 text-sm mt-1">Try a different search term</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-3">{results.length} result{results.length !== 1 ? "s" : ""} for "{dq}"</p>
          {results.map(r => (
            <button key={r.id} onClick={() => navigate(`/isTeam/accounts/${r.id}`)}
              className="w-full bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md p-4 flex items-center gap-4 text-left transition group">
              <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-base flex-shrink-0">
                {(r.businessName ?? "?")[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-800">{r.businessName}</span>
                  <StatusBadge status={r.accountStatus ?? "Unknown"} />
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {r.ownerName && <span>{r.ownerName}</span>}
                  {r.ownerEmail && <span className="flex items-center gap-1"><Mail size={10} />{r.ownerEmail}</span>}
                  {r.phone && <span className="flex items-center gap-1"><Phone size={10} />{r.phone}</span>}
                </div>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0 text-right">
                <div>
                  <div className="text-xs font-medium text-slate-700">{r.planName ?? "No plan"}</div>
                  {r.priceCents && <div className="text-xs text-slate-500">${(r.priceCents / 100).toFixed(0)}/mo</div>}
                </div>
                <div>
                  <div className="text-xs text-slate-400">ID #{r.id}</div>
                  {r.signupDate && <div className="text-xs text-slate-400">{formatDistanceToNow(new Date(r.signupDate), { addSuffix: true })}</div>}
                </div>
                <ChevronRight size={16} className="text-slate-400 group-hover:text-indigo-500 transition" />
              </div>
            </button>
          ))}
        </div>
      )}

      {!dq && (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Search size={28} className="text-indigo-400" />
          </div>
          <p className="text-slate-600 font-medium">Search for an account to get started</p>
          <p className="text-slate-400 text-sm mt-1">Support agents can find accounts in seconds</p>
        </div>
      )}
    </div>
  );
}
