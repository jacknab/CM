import { Filter, X, ExternalLink, RotateCcw, UserX, Clock, DollarSign, Send, MessageSquare, AlertTriangle, FileText, Calendar, Phone, Ticket } from "lucide-react";

export interface ActivityFilters {
  range: string;
  category: string;
  customFrom: string;
  customTo: string;
}

interface Props {
  filters: ActivityFilters;
  onChange: (f: ActivityFilters) => void;
  accountId: number;
  onQuickAction?: (action: string) => void;
}

const DATE_RANGES = [
  { value: "1d",  label: "Last 24 Hours" },
  { value: "7d",  label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 3 Months" },
  { value: "custom", label: "Custom Range" },
];

const CATEGORIES = [
  { value: "all",             label: "All Activities" },
  { value: "appointment",     label: "Appointments" },
  { value: "sms",             label: "SMS" },
  { value: "ai_receptionist", label: "AI Receptionist" },
  { value: "billing",         label: "Billing" },
  { value: "support",         label: "Support Actions" },
];

export default function ActivityFilterPanel({ filters, onChange, onQuickAction }: Props) {
  const isDirty = filters.range !== "7d" || filters.category !== "all";

  return (
    <div className="w-52 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto scrollbar-thin">
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Activity Filters</span>
          </div>
          {isDirty && (
            <button onClick={() => onChange({ range: "7d", category: "all", customFrom: "", customTo: "" })} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">Clear</button>
          )}
        </div>
        <div className="mb-2.5">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Date Range</label>
          <select value={filters.range} onChange={e => onChange({ ...filters, range: e.target.value })} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition">
            {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {filters.range === "custom" && (
          <div className="space-y-1.5 mb-2.5">
            <div><label className="block text-[10px] text-slate-500 mb-0.5">From</label><input type="date" value={filters.customFrom} onChange={e => onChange({ ...filters, customFrom: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" /></div>
            <div><label className="block text-[10px] text-slate-500 mb-0.5">To</label><input type="date" value={filters.customTo} onChange={e => onChange({ ...filters, customTo: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" /></div>
          </div>
        )}
        <div className="mb-2.5">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Activity Type</label>
          <select value={filters.category} onChange={e => onChange({ ...filters, category: e.target.value })} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <SideSection title="Quick Links">
        {[
          { label: "View Open Tickets",  icon: <Ticket size={12} />,   action: "tickets" },
          { label: "View Invoices",      icon: <FileText size={12} />, action: "invoices" },
          { label: "View AI Calls",      icon: <Phone size={12} />,    action: "ai_calls" },
          { label: "View Appointments",  icon: <Calendar size={12} />, action: "appointments" },
        ].map(item => <QuickLinkButton key={item.action} label={item.label} icon={item.icon} onClick={() => onQuickAction?.(item.action)} />)}
      </SideSection>

      <SideSection title="Popular Actions">
        {[
          { label: "Reset Password",  icon: <RotateCcw size={12} />,  action: "reset_password" },
          { label: "Suspend Account", icon: <UserX size={12} />,      action: "suspend" },
          { label: "Extend Trial",    icon: <Clock size={12} />,      action: "extend_trial" },
          { label: "Issue Refund",    icon: <DollarSign size={12} />, action: "refund" },
        ].map(item => <QuickLinkButton key={item.action} label={item.label} icon={item.icon} onClick={() => onQuickAction?.(item.action)} />)}
      </SideSection>

      <SideSection title="Support Shortcuts">
        {[
          { label: "Send Help Article",    icon: <Send size={12} />,          action: "send_article" },
          { label: "Start Live Chat",      icon: <MessageSquare size={12} />, action: "live_chat" },
          { label: "Escalate to Tech",     icon: <AlertTriangle size={12} />, action: "escalate" },
          { label: "Create Internal Note", icon: <FileText size={12} />,      action: "create_note" },
        ].map(item => <QuickLinkButton key={item.action} label={item.label} icon={item.icon} onClick={() => onQuickAction?.(item.action)} />)}
      </SideSection>
    </div>
  );
}

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 border-b border-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function QuickLinkButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition group">
      <div className="flex items-center gap-2"><span className="text-slate-400 group-hover:text-indigo-500 transition">{icon}</span>{label}</div>
      <ExternalLink size={9} className="text-slate-300 group-hover:text-slate-400 transition" />
    </button>
  );
}
