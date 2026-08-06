import { useState } from "react";
import { Filter, X, Search, RotateCcw } from "lucide-react";
import { clsx } from "clsx";

export interface FullActivityFilters {
  range: string;
  customFrom: string;
  customTo: string;
  categories: string[];
  actor: string;
  severity: string;
  search: string;
}

export const DEFAULT_FILTERS: FullActivityFilters = {
  range: "7d",
  customFrom: "",
  customTo: "",
  categories: [],
  actor: "all",
  severity: "all",
  search: "",
};

interface Props {
  filters: FullActivityFilters;
  onChange: (f: FullActivityFilters) => void;
}

const DATE_RANGES = [
  { value: "today",     label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d",        label: "Last 7 Days" },
  { value: "30d",       label: "Last 30 Days" },
  { value: "90d",       label: "Last 90 Days" },
  { value: "custom",    label: "Custom Range" },
];

const ACTIVITY_TYPES = [
  { value: "authentication",  label: "Authentication",    color: "bg-orange-100 text-orange-700" },
  { value: "appointment",     label: "Appointments",      color: "bg-indigo-100 text-indigo-700" },
  { value: "ai_receptionist", label: "AI Receptionist",   color: "bg-sky-100 text-sky-700" },
  { value: "billing",         label: "Billing",           color: "bg-emerald-100 text-emerald-700" },
  { value: "website",         label: "Website",           color: "bg-teal-100 text-teal-700" },
  { value: "sms",             label: "SMS",               color: "bg-violet-100 text-violet-700" },
  { value: "email",           label: "Email",             color: "bg-blue-100 text-blue-700" },
  { value: "users",           label: "Users",             color: "bg-rose-100 text-rose-700" },
  { value: "subscription",    label: "Subscription",      color: "bg-purple-100 text-purple-700" },
  { value: "support",         label: "Support Actions",   color: "bg-amber-100 text-amber-700" },
  { value: "system",          label: "System",            color: "bg-slate-100 text-slate-700" },
];

const ACTOR_OPTIONS = [
  { value: "all",           label: "All Actors" },
  { value: "customer",      label: "Customer" },
  { value: "support_agent", label: "Support Agent" },
  { value: "system",        label: "System" },
  { value: "admin",         label: "Admin" },
  { value: "api",           label: "API" },
];

const SEVERITY_OPTIONS = [
  { value: "all",      label: "All Severities" },
  { value: "info",     label: "Info",     dot: "bg-slate-400" },
  { value: "warning",  label: "Warning",  dot: "bg-amber-500" },
  { value: "critical", label: "Critical", dot: "bg-rose-500" },
];

function isDirty(f: FullActivityFilters): boolean {
  return f.range !== "7d" || f.categories.length > 0 || f.actor !== "all"
    || f.severity !== "all" || f.search.trim() !== "";
}

export default function ActivityFilterPanelFull({ filters, onChange }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search);

  const toggleCategory = (v: string) => {
    const next = filters.categories.includes(v)
      ? filters.categories.filter(c => c !== v)
      : [...filters.categories, v];
    onChange({ ...filters, categories: next });
  };

  const clearAll = () => {
    setSearchInput("");
    onChange(DEFAULT_FILTERS);
  };

  const commitSearch = () => {
    onChange({ ...filters, search: searchInput });
  };

  const dirty = isDirty(filters) || searchInput.trim() !== "";

  return (
    <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Filters</span>
          {dirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
          )}
        </div>
        {dirty && (
          <button onClick={clearAll} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-600 font-medium transition">
            <RotateCcw size={9} />
            Clear
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Search Events</label>
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitSearch(); }}
            onBlur={commitSearch}
            placeholder="Title, phone, invoice…"
            className="w-full pl-7 pr-6 text-xs border border-slate-200 rounded-lg py-1.5 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); onChange({ ...filters, search: "" }); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Date Range */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date Range</label>
        <div className="space-y-0.5">
          {DATE_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => onChange({ ...filters, range: r.value })}
              className={clsx(
                "w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition",
                filters.range === r.value
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {filters.range === "custom" && (
          <div className="mt-2 space-y-1.5">
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">From</label>
              <input type="date" value={filters.customFrom}
                onChange={e => onChange({ ...filters, customFrom: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">To</label>
              <input type="date" value={filters.customTo}
                onChange={e => onChange({ ...filters, customTo: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
        )}
      </div>

      {/* Activity Types */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Activity Types</label>
          {filters.categories.length > 0 && (
            <button onClick={() => onChange({ ...filters, categories: [] })} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
              All
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {ACTIVITY_TYPES.map(t => {
            const active = filters.categories.includes(t.value);
            return (
              <button
                key={t.value}
                onClick={() => toggleCategory(t.value)}
                className={clsx(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition",
                  active ? "bg-slate-100" : "hover:bg-slate-50"
                )}
              >
                <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", t.color.split(" ")[0])} />
                <span className={clsx("flex-1 text-left", active ? "text-slate-900 font-medium" : "text-slate-600")}>
                  {t.label}
                </span>
                {active && <X size={9} className="text-slate-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actor */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Actor</label>
        <select
          value={filters.actor}
          onChange={e => onChange({ ...filters, actor: e.target.value })}
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition"
        >
          {ACTOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Severity */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Severity</label>
        <div className="space-y-0.5">
          {SEVERITY_OPTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => onChange({ ...filters, severity: s.value })}
              className={clsx(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition",
                filters.severity === s.value
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {s.dot && <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", s.dot)} />}
              {!s.dot && <span className="w-1.5 h-1.5 flex-shrink-0" />}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters summary */}
      {dirty && (
        <div className="px-3 py-2.5">
          <p className="text-[10px] text-slate-400 italic">
            {[
              filters.categories.length > 0 && `${filters.categories.length} type(s)`,
              filters.actor !== "all" && `Actor: ${filters.actor}`,
              filters.severity !== "all" && `Severity: ${filters.severity}`,
              filters.search && `Search: "${filters.search}"`,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
