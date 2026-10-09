import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Building2, LayoutGrid, Users, Wallet, FileText, Wrench, BarChart3,
  Settings, ArrowLeft, MoreHorizontal, X,
} from "lucide-react";

const PRIMARY = [
  { label: "Today", to: "/rentals/today", icon: Building2 },
  { label: "Spaces", to: "/rentals/spaces", icon: LayoutGrid },
  { label: "Pros", to: "/rentals/professionals", icon: Users },
  { label: "Leases", to: "/rentals/leases", icon: FileText },
];

const MORE = [
  { label: "Rent", to: "/rentals/rent", icon: Wallet },
  { label: "Maintenance", to: "/rentals/maintenance", icon: Wrench, comingSoon: true },
  { label: "Reports", to: "/rentals/reports", icon: BarChart3, comingSoon: true },
  { label: "Settings", to: "/rentals/settings", icon: Settings, comingSoon: true },
];

/** Touch-sized bottom nav for tablet/mobile — Rentals' own dark chrome, not the Salon MobileBottomNav. */
export default function RentalsMobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />
          <div className="relative rounded-t-2xl bg-neutral-950 pb-[env(safe-area-inset-bottom,0px)]">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-[Outfit] text-sm font-semibold text-white">Certxa Rentals</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-neutral-400" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="px-3 pb-2">
              {MORE.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-medium text-neutral-300"
                >
                  <item.icon size={17} className="text-neutral-500" />
                  <span className="flex-1">{item.label}</span>
                  {item.comingSoon && (
                    <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-500">
                      Soon
                    </span>
                  )}
                </NavLink>
              ))}
              <button
                onClick={() => navigate("/overview")}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-medium text-neutral-400"
              >
                <ArrowLeft size={17} />
                Back to Certxa Salon
              </button>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-neutral-900 bg-neutral-950 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                isActive ? "text-amber-400" : "text-neutral-500"
              }`
            }
          >
            <item.icon size={19} />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-neutral-500"
        >
          <MoreHorizontal size={19} />
          More
        </button>
      </nav>
    </>
  );
}
