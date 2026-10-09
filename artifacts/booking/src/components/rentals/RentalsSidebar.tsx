import { NavLink, useNavigate } from "react-router-dom";
import {
  Building2, LayoutGrid, Users, Wallet, FileText, Wrench, BarChart3,
  Settings, ArrowLeft,
} from "lucide-react";

// Certxa Rentals has its own visual identity, deliberately distinct from the
// Certxa Salon theme (see Rentals Phase 0 audit, Section I): a near-neutral
// graphite chrome with a single warm accent, rather than Salon's warm
// terracotta/cream "editorial paper" palette or isTeam's indigo/navy. Built
// with plain Tailwind utilities (not the shared shadcn/theme-token
// primitives) for the same reason isTeam's shell does — those primitives
// carry Salon's `--primary`/`--sidebar` colors globally.

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
};

const NAV: NavItem[] = [
  { label: "Today", to: "/rentals/today", icon: <Building2 size={17} /> },
  { label: "Spaces", to: "/rentals/spaces", icon: <LayoutGrid size={17} /> },
  { label: "Professionals", to: "/rentals/professionals", icon: <Users size={17} /> },
  { label: "Leases", to: "/rentals/leases", icon: <FileText size={17} /> },
  { label: "Rent", to: "/rentals/rent", icon: <Wallet size={17} /> },
  { label: "Maintenance", to: "/rentals/maintenance", icon: <Wrench size={17} />, comingSoon: true },
  { label: "Reports", to: "/rentals/reports", icon: <BarChart3 size={17} />, comingSoon: true },
  { label: "Settings", to: "/rentals/settings", icon: <Settings size={17} /> },
];

export default function RentalsSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex w-60 flex-shrink-0 flex-col bg-neutral-950 border-r border-neutral-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-400/10 text-amber-400">
          <Building2 size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-[Outfit] text-[13px] font-semibold leading-tight text-white">
            Certxa Rentals
          </div>
          <div className="text-[11px] text-neutral-500">Facility management</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                isActive
                  ? "bg-neutral-800/80 text-amber-400"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`
            }
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.comingSoon && (
              <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-500">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-neutral-900 p-3">
        <button
          onClick={() => navigate("/overview")}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-300"
        >
          <ArrowLeft size={14} />
          Back to Certxa Salon
        </button>
      </div>
    </aside>
  );
}
