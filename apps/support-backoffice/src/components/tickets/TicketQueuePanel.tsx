import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Ticket, RefreshCw, SlidersHorizontal, ArrowUpDown, MessageSquare } from "lucide-react";
import { api, type Ticket as TicketType } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { clsx } from "clsx";

const QUEUE_FILTERS = [
  { value: "my_open",    label: "My Open Tickets" },
  { value: "unassigned", label: "Unassigned" },
  { value: "open",       label: "All Open" },
  { value: "pending",    label: "Pending" },
  { value: "waiting",    label: "Waiting on Customer" },
  { value: "escalated",  label: "Escalated" },
  { value: "resolved",   label: "Resolved" },
  { value: "closed",     label: "Closed" },
];

const PRIORITY_CFG: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-red-100",    text: "text-red-700",    label: "URGENT" },
  high:   { bg: "bg-orange-100", text: "text-orange-700", label: "HIGH" },
  normal: { bg: "bg-blue-100",   text: "text-blue-700",   label: "MEDIUM" },
  medium: { bg: "bg-blue-100",   text: "text-blue-700",   label: "MEDIUM" },
  low:    { bg: "bg-slate-100",  text: "text-slate-500",  label: "LOW" },
};

// Generate a consistent color for account name initials
const AVATAR_COLORS = [
  "bg-rose-500",   "bg-orange-500", "bg-amber-500",  "bg-emerald-600",
  "bg-teal-600",   "bg-sky-600",    "bg-indigo-600", "bg-violet-600",
  "bg-purple-600", "bg-pink-600",   "bg-cyan-600",   "bg-lime-600",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
}

interface Props {
  activeTicketId: number | null;
}

export default function TicketQueuePanel({ activeTicketId }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("my_open");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => { setPage(1); }, [filter]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-ticket-queue", filter, debouncedSearch, page],
    queryFn: () => api.tickets.list({ filter, search: debouncedSearch, page }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const tickets: TicketType[] = data?.tickets ?? [];
  const total: number = data?.total ?? 0;
  const activeLabel = QUEUE_FILTERS.find(f => f.value === filter)?.label ?? "Tickets";

  return (
    <div className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex-shrink-0 space-y-2">
        {/* Queue selector */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1" ref={dropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition"
            >
              <span className="truncate">{activeLabel}</span>
              <ChevronDown size={12} className="text-slate-400 flex-shrink-0 ml-1" />
            </button>
            {showFilterDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 py-1 overflow-hidden">
                {QUEUE_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => { setFilter(f.value); setShowFilterDropdown(false); }}
                    className={clsx(
                      "w-full text-left px-3 py-2 text-xs transition",
                      filter === f.value ? "text-indigo-700 font-semibold bg-indigo-50" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => refetch()} className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition flex-shrink-0">
            <RefreshCw size={11} />
          </button>
        </div>

        {/* Filter + Sort row */}
        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
            <SlidersHorizontal size={10} /> Filters
          </button>
          <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition ml-auto">
            Sort: Updated <ArrowUpDown size={9} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-indigo-300 focus:bg-white transition"
          />
        </div>
      </div>

      {/* Ticket List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center py-14 px-4 text-center">
            <Ticket size={28} className="text-slate-200 mb-3" />
            <p className="text-xs font-medium text-slate-500">No tickets found</p>
            <p className="text-[10px] text-slate-400 mt-1">Try changing your filter</p>
          </div>
        ) : (
          <>
            {tickets.map(t => (
              <TicketCard
                key={t.id}
                ticket={t}
                isActive={t.id === activeTicketId}
                onClick={() => navigate(`/tickets/${t.id}`)}
              />
            ))}
            {total > tickets.length && (
              <button
                onClick={() => setPage(p => p + 1)}
                className="w-full py-3 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition font-medium border-t border-slate-100"
              >
                Load more tickets
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TicketCard({ ticket, isActive, onClick }: { ticket: TicketType; isActive: boolean; onClick: () => void }) {
  const pri = PRIORITY_CFG[ticket.priority?.toLowerCase()] ?? PRIORITY_CFG.normal;
  const accountName = ticket.account_name ?? "Unknown";
  const initials = getInitials(accountName);
  const avatarColor = getAvatarColor(accountName);
  const ago = formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: false }) + " ago";

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left px-3 py-3 border-b border-slate-100 transition group flex items-start gap-2.5",
        isActive
          ? "bg-indigo-50 border-l-2 border-l-indigo-500"
          : "border-l-2 border-l-transparent hover:bg-slate-50"
      )}
    >
      {/* Account avatar */}
      <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5", avatarColor)}>
        {initials || "?"}
      </div>

      <div className="flex-1 min-w-0">
        {/* Priority + ticket number + time */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded", pri.bg, pri.text)}>
            {pri.label}
          </span>
          <span className="text-[9px] font-mono text-slate-400">{ticket.ticket_number}</span>
          <span className="text-[9px] text-slate-400 ml-auto">{ago}</span>
        </div>

        {/* Subject */}
        <p className="text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2 mb-1">
          {ticket.subject}
        </p>

        {/* Business name + message count */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 truncate">{accountName}</span>
          {(ticket.message_count ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-slate-400 flex-shrink-0 ml-2">
              <MessageSquare size={9} />
              {ticket.message_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
