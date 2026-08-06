import { CalendarDays, TrendingUp, Users, AlignJustify, X, LayoutDashboard, Calendar, Scissors, ShoppingBag, Banknote, Building2, FileText, Star, MessageSquare, Clock, ListOrdered, MapPin, ClipboardList, BarChart3, Settings, LogOut, Plus } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-features";
import { usePermissions } from "@/hooks/use-permissions";

const TABS = [
  { icon: LayoutDashboard, to: "/overview",  label: "Home" },
  { icon: CalendarDays,    to: "/calendar",  label: "Calendar" },
  { icon: Users,           to: "/customers", label: "Clients" },
];

const NAV_SECTIONS = [
  {
    label: "Overview",
    ownerOnly: false,
    items: [
      { to: "/overview",   label: "Dashboard",  icon: LayoutDashboard },
      { to: "/analytics",  label: "Analytics",  icon: TrendingUp },
    ],
  },
  {
    label: "Calendar",
    ownerOnly: false,
    items: [
      { to: "/calendar",          label: "Calendar",          icon: Calendar },
      { to: "/calendar-settings", label: "Calendar Settings", icon: Settings },
    ],
  },
  {
    label: "Clients",
    ownerOnly: true,
    items: [
      { to: "/customers",      label: "Clients",       icon: Users },
      { to: "/waitlist",       label: "Waitlist",      icon: Clock },
      { to: "/dashboard/queue",label: "Queue",         icon: ListOrdered },
      { to: "/loyalty",        label: "Loyalty",       icon: Star },
      { to: "/sms-inbox",      label: "SMS Inbox",     icon: MessageSquare },
      { to: "/campaigns",      label: "Campaigns",     icon: MessageSquare },
      { to: "/google-business",label: "Google Reviews",icon: MapPin },
    ],
  },
  {
    label: "Business",
    ownerOnly: true,
    items: [
      { to: "/services",          label: "Services",       icon: Scissors },
      { to: "/payouts/contractors", label: "Team",           icon: Users },
      { to: "/products",          label: "Products",       icon: ShoppingBag },
      { to: "/intake-forms",      label: "Intake Forms",   icon: ClipboardList },
    ],
  },
  {
    label: "Finance",
    ownerOnly: true,
    items: [
      { to: "/reports",           label: "Reports",     icon: FileText },
      { to: "/cash-drawer",       label: "Cash Drawer", icon: Banknote },
      { to: "/commission-report", label: "Commissions", icon: BarChart3 },
    ],
  },
  {
    label: "Settings",
    ownerOnly: true,
    items: [
      { to: "/business-settings", label: "Business Settings", icon: Building2 },
    ],
  },
];

// GlossGenius palette — dark bar, white active, lime accent
const ACTIVE   = "#ffffff";
const INACTIVE = "rgba(255,255,255,0.38)";
const NAV_BG   = "#0f0f0f";
const DRAWER_BG = "#111111";
const LIME     = "#c5d42a";

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logoutAsync } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { selectedStore } = useSelectedStore();
  const { isStaff } = usePermissions();

  const { data: subscription } = useQuery<any>({
    queryKey: ["/api/billing/profile", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/billing/profile/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload?.subscription ?? null;
    },
    enabled: !!selectedStore?.id && !isStaff,
    staleTime: 5 * 60 * 1000,
  });
  const isSolo = (selectedStore as any)?.teamSize === "myself" || !!subscription?.planCode?.toLowerCase().includes("solo");
  const features = useFeatureFlags();

  return (
    <>
      {/* ── Bottom Tab Bar ── */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 md:hidden flex items-stretch"
        style={{
          height: "calc(60px + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: NAV_BG,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {TABS.map(({ icon: Icon, label, to }) => {
          const active =
            pathname === to ||
            (to === "/calendar" && pathname.startsWith("/calendar")) ||
            (to === "/customers" && pathname.startsWith("/customers"));
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none active:opacity-60 transition-opacity"
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.6}
                style={{ color: active ? ACTIVE : INACTIVE, transition: "color 0.15s" }}
              />
              <span
                className="text-[9px] font-semibold tracking-wide"
                style={{ color: active ? ACTIVE : INACTIVE }}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* New Booking quick-action tab */}
        <Link
          to="/booking/new"
          aria-label="New Booking"
          className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none active:opacity-60 transition-opacity"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: LIME }}
          >
            <Plus color="#0f0f0f" size={18} strokeWidth={2.5} />
          </div>
          <span
            className="text-[9px] font-semibold tracking-wide"
            style={{ color: pathname === "/booking/new" ? ACTIVE : INACTIVE }}
          >
            Book
          </span>
        </Link>

        {/* Menu tab — opens drawer */}
        <button
          aria-label="Menu"
          onClick={() => setMenuOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none active:opacity-60 transition-opacity"
        >
          <AlignJustify
            size={22}
            strokeWidth={menuOpen ? 2.2 : 1.6}
            style={{ color: menuOpen ? ACTIVE : INACTIVE, transition: "color 0.15s" }}
          />
          <span
            className="text-[9px] font-semibold tracking-wide"
            style={{ color: menuOpen ? ACTIVE : INACTIVE }}
          >
            Menu
          </span>
        </button>
      </div>

      {/* ── Nav Drawer ── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-[60] md:hidden"
              style={{ background: "rgba(0,0,0,0.65)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
            />

            {/* Drawer panel — slides in from left */}
            <motion.div
              key="drawer"
              className="fixed left-0 top-0 bottom-0 z-[61] md:hidden flex flex-col shadow-2xl"
              style={{ width: 280, background: DRAWER_BG, borderRight: "1px solid rgba(255,255,255,0.07)" }}
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Drawer header */}
              <div
                className="flex items-center justify-between px-4 py-4"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Link
                  to="/overview"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <img
                    src="/web-app.png"
                    alt="Certxa"
                    className="w-7 h-7 rounded-xl shadow-md"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                      fontSize: "1.1rem",
                      letterSpacing: "-0.03em",
                      color: "#ffffff",
                    }}
                  >
                    Certxa<span style={{ color: "#c5d42a" }}>.</span>
                  </span>
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  aria-label="Close menu"
                >
                  <X size={16} color="rgba(255,255,255,0.6)" />
                </button>
              </div>

              {/* Nav sections — scrollable */}
              <div className="flex-1 overflow-y-auto py-2">
                {NAV_SECTIONS.filter((section) => {
                  if (isStaff && section.ownerOnly) return false;
                  return true;
                }).map((section) => (
                  <div key={section.label} className="mb-1">
                    <p
                      className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                    >
                      {section.label}
                    </p>
                    {section.items.filter(({ to }) => {
                      if (isSolo && to === "/payouts/contractors") return false;
                      if (!features.waitlist     && to === "/waitlist")      return false;
                      if (!features.pos          && to === "/cash-drawer")   return false;
                      if (!features.rewardPoints && to === "/loyalty")       return false;
                      if (!features.timeclock    && to === "/timeclock")     return false;
                      return true;
                    }).map(({ to, label, icon: Icon }) => {
                      const active = pathname === to || pathname.startsWith(to + "/");
                      return (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                          style={{
                            color: active ? "#ffffff" : "rgba(255,255,255,0.6)",
                            background: active ? "rgba(255,255,255,0.08)" : "transparent",
                          }}
                        >
                          <Icon
                            size={17}
                            strokeWidth={active ? 2.2 : 1.6}
                            style={{ color: active ? ACTIVE : "rgba(255,255,255,0.4)" }}
                          />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Log out */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    await logoutAsync();
                    navigate("/auth");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-4 text-sm font-medium transition-colors"
                  style={{ color: "rgba(255,100,100,0.9)" }}
                >
                  <LogOut size={17} strokeWidth={1.8} style={{ color: "rgba(255,100,100,0.7)" }} />
                  Log out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
