import { Link, useLocation, useNavigate } from "react-router-dom";
import { useContext } from "react";
import { StoreContext } from "@/hooks/use-store";
import {
  Map, ClipboardList, FileText, Users, Receipt,
  HardHat, BarChart3, Settings, LogOut, Menu, X, ChevronDown, Zap, Navigation2, CalendarClock, Star
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const NAV = [
  { label: "Dispatch", icon: Map, path: "/pro-dashboard" },
  { label: "Schedule", icon: CalendarClock, path: "/pro-dashboard/schedule" },
  { label: "Map", icon: Navigation2, path: "/pro-dashboard/map" },
  { label: "Jobs", icon: ClipboardList, path: "/pro-dashboard/jobs" },
  { label: "Estimates", icon: FileText, path: "/pro-dashboard/estimates" },
  { label: "Customers", icon: Users, path: "/pro-dashboard/customers" },
  { label: "Invoices", icon: Receipt, path: "/pro-dashboard/invoices" },
  { label: "Crews", icon: HardHat, path: "/pro-dashboard/crews" },
  { label: "Google Reviews", icon: Star, path: "/pro-dashboard/google-reviews" },
  { label: "Reports", icon: BarChart3, path: "/pro-dashboard/reports" },
  { label: "Settings", icon: Settings, path: "/pro-dashboard/settings" },
];

export function useProStore() {
  const ctx = useContext(StoreContext);
  return ctx?.selectedStore ?? null;
}

export default function ProDashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const store = useProStore();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/auth");
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00D4AA] flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#050C18]" />
          </div>
          <div>
            <span className="font-extrabold text-white text-sm tracking-tight">Certxa</span>
            <span className="block text-[#00D4AA] text-[10px] font-semibold uppercase tracking-widest -mt-0.5">Pro</span>
          </div>
        </Link>
      </div>

      {/* Business name */}
      {store && (
        <div className="px-4 py-3 mx-3 mt-3 bg-white/5 rounded-xl border border-white/8">
          <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Business</p>
          <p className="text-white text-sm font-semibold truncate mt-0.5">{store.name}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, icon: Icon, path }) => {
          const active = path === "/pro-dashboard" ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? "bg-[#00D4AA]/15 text-[#00D4AA] border border-[#00D4AA]/20"
                  : "text-white/55 hover:text-white hover:bg-white/6"
              }`}
            >
              <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${active ? "text-[#00D4AA]" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-white/8 space-y-1">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#060E1A] text-white overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-[#0A1628] border-r border-white/8 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-[#0A1628] border-r border-white/8 flex flex-col z-10">
            <button className="absolute top-4 right-4 text-white/50" onClick={() => setMobileOpen(false)}>
              <X className="w-5 h-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#0A1628]">
          <button onClick={() => setMobileOpen(true)} className="text-white/60">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-white">Certxa Pro</span>
          <div className="w-5" />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
