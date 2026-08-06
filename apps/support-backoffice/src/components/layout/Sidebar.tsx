import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, Search, UserCheck, FlaskConical, Ban,
  Ticket, MessageSquare, AlertTriangle, CreditCard, FileText,
  RefreshCw, Phone, Calendar, Globe, MessageCircle,
  Activity, Monitor, AlertCircle, BarChart2, UserCog,
  Settings, ChevronDown, ChevronRight, LogOut, ArrowRightLeft,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type NavItem = {
  label: string;
  icon: React.ReactNode;
  to?: string;
  section?: string;
  children?: { label: string; to: string; badge?: number | "dot" | "live" }[];
};

const nav: NavItem[] = [
  { label: "Home", icon: <LayoutDashboard size={16} />, to: "/dashboard" },
  {
    label: "Accounts", icon: <Users size={16} />, section: "ACCOUNTS",
    children: [
      { label: "Search Accounts", to: "/accounts" },
      { label: "Active Accounts", to: "/accounts?status=Active" },
      { label: "Trials", to: "/accounts?status=Trial" },
      { label: "Suspended", to: "/accounts?status=Suspended" },
    ],
  },
  {
    label: "Support", icon: <Ticket size={16} />, section: "SUPPORT",
    children: [
      { label: "Tickets", to: "/tickets", badge: 18 },
      { label: "Live Chat", to: "/chat", badge: "live" },
      { label: "Escalations", to: "/escalations" },
    ],
  },
  {
    label: "Billing", icon: <CreditCard size={16} />, section: "BILLING",
    children: [
      { label: "Subscriptions", to: "/billing/subscriptions" },
      { label: "Invoices", to: "/billing/invoices" },
      { label: "Refunds & Credits", to: "/billing/refunds" },
    ],
  },
  {
    label: "Products", icon: <Activity size={16} />, section: "PRODUCTS",
    children: [
      { label: "AI Receptionist", to: "/products/ai" },
      { label: "Booking System", to: "/products/booking" },
      { label: "Website", to: "/products/website" },
      { label: "SMS & Email", to: "/products/sms" },
    ],
  },
  {
    label: "Monitoring", icon: <Monitor size={16} />, section: "MONITORING",
    children: [
      { label: "Service Health", to: "/incidents" },
      { label: "Website Status", to: "/monitoring/website" },
      { label: "Error Logs", to: "/monitoring/errors" },
    ],
  },
  { label: "Reports", icon: <BarChart2 size={16} />, section: "REPORTS", to: "/reports" },
  { label: "Staff", icon: <UserCog size={16} />, section: "STAFF", to: "/staff" },
  { label: "Settings", icon: <Settings size={16} />, section: "SETTINGS", to: "/settings" },
];

function NavGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [open, setOpen] = useState(
    item.label === "Accounts" || item.label === "Support"
  );

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          clsx(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition",
            isActive
              ? "bg-indigo-600/20 text-indigo-400"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5",
            collapsed && "justify-center px-2"
          )
        }
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );
  }

  if (collapsed) {
    return (
      <div title={item.label} className="flex items-center justify-center px-2 py-2 text-slate-500 rounded-lg">
        {item.icon}
      </div>
    );
  }

  return (
    <div>
      {item.section && (
        <div className="px-3 pt-4 pb-1">
          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{item.section}</span>
        </div>
      )}
      {item.children && (
        <div className="space-y-0.5">
          {item.children.map(child => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition",
                  isActive
                    ? "text-indigo-400 bg-indigo-600/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                )
              }
            >
              <span>{child.label}</span>
              {typeof child.badge === "number" && child.badge > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {child.badge}
                </span>
              )}
              {child.badge === "live" && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { agent, logout } = useAuth();
  const navigate = useNavigate();
  const initials = [(agent?.firstName?.[0] ?? ""), (agent?.lastName?.[0] ?? "")].join("").toUpperCase() || "SA";

  return (
    <div
      className={clsx(
        "bg-[#0f1729] border-r border-slate-800 flex flex-col flex-shrink-0 transition-all duration-200",
        collapsed ? "w-14" : "w-52"
      )}
    >
      {/* Logo */}
      <div className={clsx("px-4 py-4 border-b border-slate-800 flex-shrink-0", collapsed && "px-2")}>
        {collapsed ? (
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mx-auto flex-shrink-0">
            <Activity size={16} className="text-white" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Activity size={16} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">BACK OFFICE</div>
              <div className="text-slate-500 text-[10px]">Support Platform</div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto scrollbar-thin space-y-0.5">
        {nav.map(item => (
          <NavGroup key={item.label} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Agent Footer */}
      {!collapsed && (
        <div className="px-3 py-2 border-t border-slate-800">
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-300 text-xs font-medium truncate">{agent?.name}</div>
              <div className="text-slate-500 text-[10px] capitalize">{agent?.role}</div>
            </div>
            <button
              onClick={() => logout.mutateAsync().then(() => navigate("/login"))}
              className="text-slate-500 hover:text-slate-300 transition p-1 rounded"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className={clsx("border-t border-slate-800 p-2", collapsed ? "flex justify-center" : "")}>
        <button
          onClick={onToggleCollapse}
          className={clsx(
            "flex items-center gap-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition text-xs font-medium",
            collapsed ? "p-2 justify-center" : "px-3 py-2 w-full"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={15} />
          ) : (
            <>
              <PanelLeftClose size={15} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
