import { useNavigate } from "react-router-dom";
import { CalendarDays, LogIn, MoreHorizontal, UserCog, UserRound, type LucideIcon } from "lucide-react";

export type NailTab = "techs" | "pos" | "board";

interface Props {
  tab: NailTab;
  onTab: (t: NailTab) => void;
  onCheckIn: () => void;
  onMore: () => void;
  waiting: number;
  inService: number;
  live: boolean;
}

// POS and In Service have no footer button — those tabs are still opened from inside the app (ticket taps, check-in, checkout).
export function BottomNav({ tab, onTab, onCheckIn, onMore, waiting, inService, live }: Props) {
  const navigate = useNavigate();
  const items: { label: string; icon: LucideIcon; active?: boolean; run: () => void; badges?: boolean }[] = [
    { label: "Techs", icon: UserCog, active: tab === "techs", run: () => onTab("techs") },
    { label: "Calendar", icon: CalendarDays, run: () => navigate("/calendar") },
    { label: "Customers", icon: UserRound, run: () => navigate("/client-lookup") },
    { label: "Check-In", icon: LogIn, run: onCheckIn },
    { label: "More", icon: MoreHorizontal, run: onMore },
  ];
  return (
    <nav className="bottom-nav" data-testid="nail-bottom-nav">
      {items.map(({ label, icon: Icon, active, run, badges }) => (
        <button key={label} type="button" onClick={run} className={active ? "active" : ""} data-testid={`nail-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <Icon size={28} />
          <span>{label}</span>
          {badges && inService > 0 && <i className="nav-badge-service">{inService}</i>}
        </button>
      ))}
      <div className="connection" data-testid="nail-live" style={live ? undefined : { color: "#8b94a0" }}>
        <span style={live ? undefined : { background: "#5d6571", boxShadow: "none" }} /> {live ? "Connected" : "Offline"}
      </div>
    </nav>
  );
}
