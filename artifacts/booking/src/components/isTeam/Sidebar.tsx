import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSupportAuth } from "@/hooks/use-support-auth";
import { supportApi } from "@/lib/support-api";
import {
  Home, Users, Ticket, CreditCard, Monitor, ArrowRightLeft, BarChart2,
  UserCog, Settings, ChevronDown, ChevronRight, LogOut, Activity,
  ChevronsLeft, Package,
} from "lucide-react";

type NavChild = { label: string; to: string; badge?: number; dot?: string };
type NavItem = {
  label: string;
  icon: React.ReactNode;
  to?: string;
  dot?: string;
  children?: NavChild[];
};

const BASE_NAV: NavItem[] = [
  { label: "Home", icon: <Home size={16} />, to: "/isTeam/accounts" },
  {
    label: "Accounts", icon: <Users size={16} />,
    children: [
      { label: "Search Accounts",  to: "/isTeam/accounts" },
      { label: "Active Accounts",  to: "/isTeam/accounts?status=Active" },
      { label: "Trials",           to: "/isTeam/accounts?status=Trial" },
      { label: "Suspended",        to: "/isTeam/accounts?status=Suspended" },
    ],
  },
  {
    label: "Support", icon: <Ticket size={16} />,
    children: [
      { label: "Tickets",               to: "/isTeam/tickets" },
      { label: "Live Chat",             to: "/isTeam/live-chat", dot: "green" },
      { label: "Escalations",           to: "/isTeam/escalations" },
      { label: "Incidents & Service Health", to: "/isTeam/incidents" },
    ],
  },
  {
    label: "Billing", icon: <CreditCard size={16} />,
    children: [
      { label: "Billing Investigation", to: "/isTeam/billing-investigation" },
      { label: "Subscriptions",     to: "/isTeam/billing/subscriptions" },
      { label: "Invoices",          to: "/isTeam/billing/invoices" },
      { label: "Refunds & Credits", to: "/isTeam/billing/refunds" },
    ],
  },
  {
    label: "Products", icon: <Package size={16} />,
    children: [
      { label: "AI Receptionist", to: "/isTeam/products/ai-receptionist" },
      { label: "Booking System",  to: "/isTeam/products/booking" },
      { label: "Website",         to: "/isTeam/products/website" },
      { label: "SMS & Email",     to: "/isTeam/products/sms-email" },
    ],
  },
  { label: "Monitoring", icon: <Monitor size={16} />, to: "/isTeam/incidents" },
  { label: "Data Transfers", icon: <ArrowRightLeft size={16} />, to: "/isTeam/data-transfers" },
  { label: "Reports",        icon: <BarChart2 size={16} />,      to: "/isTeam/reports" },
  { label: "Staff",          icon: <UserCog size={16} />,        to: "/isTeam/staff" },
  { label: "Settings",       icon: <Settings size={16} />,       to: "/isTeam/settings" },
];

const DEFAULT_OPEN = new Set(["Accounts", "Support"]);

function NavGroup({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(DEFAULT_OPEN.has(item.label));

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === "/isTeam/accounts"}
        className={({ isActive }) =>
          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
            isActive ? "bg-indigo-600/20 text-indigo-400" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
          }`
        }
      >
        {item.icon}
        {item.label}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && item.children && (
        <div className="ml-6 mt-0.5 space-y-0.5">
          {item.children.map(child => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition ${
                  isActive ? "text-indigo-400 bg-indigo-600/10" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`
              }
            >
              <span className="flex items-center gap-2">
                {child.dot === "green" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                )}
                {child.label}
              </span>
              {(child.badge ?? 0) > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {child.badge! > 99 ? "99+" : child.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamSidebar() {
  const { agent, logout } = useSupportAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const initials = [(agent?.firstName?.[0] ?? ""), (agent?.lastName?.[0] ?? "")].join("").toUpperCase() || "SA";

  const { data: openTicketData } = useQuery({
    queryKey: ["support-open-ticket-count"],
    queryFn: () => supportApi.tickets.list("open", "", 1),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
  const openCount = openTicketData?.total ?? 0;

  const nav: NavItem[] = BASE_NAV.map(item => {
    if (item.label !== "Support" || !item.children) return item;
    return {
      ...item,
      children: item.children.map(child =>
        child.label === "Tickets" ? { ...child, badge: openCount } : child
      ),
    };
  });

  if (collapsed) {
    return (
      <div className="w-14 bg-[#0f1729] border-r border-slate-800 flex flex-col flex-shrink-0 items-center py-4 gap-3">
        <button onClick={() => setCollapsed(false)} className="text-slate-500 hover:text-slate-300 transition p-2">
          <ChevronRight size={16} />
        </button>
        <div className="flex-1" />
        {openCount > 0 && (
          <span className="bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {openCount > 99 ? "9+" : openCount}
          </span>
        )}
        <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{initials}</div>
        <button onClick={() => logout.mutateAsync().then(() => navigate("/isTeam/login"))} className="text-slate-500 hover:text-slate-300 p-2 rounded"><LogOut size={14} /></button>
      </div>
    );
  }

  return (
    <div className="w-56 bg-[#0f1729] border-r border-slate-800 flex flex-col flex-shrink-0">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Activity size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm leading-tight">BACK OFFICE</div>
            <div className="text-slate-500 text-[10px]">Support Platform</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {nav.map(item => <NavGroup key={item.label} item={item} />)}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-slate-300 text-xs font-medium truncate">{agent?.name}</div>
            <div className="text-slate-500 text-[10px] capitalize">{agent?.role}</div>
          </div>
          <button
            onClick={() => logout.mutateAsync().then(() => navigate("/isTeam/login"))}
            className="text-slate-500 hover:text-slate-300 transition p-1 rounded"
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
        <button onClick={() => setCollapsed(true)} className="w-full mt-2 flex items-center gap-2 px-2 py-1.5 text-slate-600 hover:text-slate-400 text-xs transition rounded">
          <ChevronsLeft size={12} />Collapse
        </button>
      </div>
    </div>
  );
}
