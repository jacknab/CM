import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Bell, MessageSquare, ChevronDown, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type SearchResult } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function TopBar() {
  const navigate = useNavigate();
  const { agent, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const dq = useDebounce(query, 250);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<SearchResult[]>({
    queryKey: ["support-search", dq],
    queryFn: () => api.search(dq),
    enabled: dq.trim().length >= 2,
    staleTime: 15_000,
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
      if (!userMenuRef.current?.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (id: number) => {
    setQuery("");
    setOpen(false);
    navigate(`/accounts/${id}`);
  };

  const initials = agent?.name
    ? agent.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "SA";

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 flex-shrink-0 z-20">
      {/* Global Search */}
      <div ref={containerRef} className="flex-1 max-w-2xl relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search business, owner, email, phone, account ID, invoice number..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition placeholder-slate-400"
          />
          {query && (
            <button onClick={() => { setQuery(""); setOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search dropdown */}
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
            {results.map(r => (
              <button
                key={r.id}
                onMouseDown={() => handleSelect(r.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left transition border-b border-slate-100 last:border-0"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold flex-shrink-0">
                  {(r.businessName ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm truncate">{r.businessName}</span>
                    <StatusBadge status={r.accountStatus} size="xs" />
                  </div>
                  <div className="text-xs text-slate-500 truncate">{r.ownerEmail} · {r.planName ?? "No plan"}</div>
                </div>
                <div className="text-xs text-slate-400 flex-shrink-0">#{r.id}</div>
              </button>
            ))}
          </div>
        )}
        {open && query.length >= 2 && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 px-4 py-6 text-center text-sm text-slate-400">
            No accounts found for "{query}"
          </div>
        )}
      </div>

      {/* Right: icons + user */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            12
          </span>
        </button>

        {/* Messages */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
          <MessageSquare size={16} />
          <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            8
          </span>
        </button>

        {/* User avatar + name */}
        <div ref={userMenuRef} className="relative ml-1">
          <button
            onClick={() => setShowUserMenu(o => !o)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 hover:bg-slate-100 rounded-lg transition"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold text-slate-800 leading-tight">{agent?.name ?? "Support Agent"}</div>
              <div className="text-[10px] text-slate-500 leading-tight capitalize">{agent?.role ?? "Support Agent"}</div>
            </div>
            <ChevronDown size={12} className="text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1">
              <button
                onClick={() => logout.mutateAsync().then(() => navigate("/login"))}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50 transition"
              >
                <LogOut size={12} className="text-slate-400" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
