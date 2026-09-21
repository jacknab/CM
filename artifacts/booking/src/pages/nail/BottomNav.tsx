import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Bell, CalendarDays, Footprints, MoreHorizontal, ShoppingBag, UserCog, UserRound, Users } from "lucide-react";

export type NailTab = "techs" | "pos" | "board";

interface Props {
  tab: NailTab;
  onTab: (t: NailTab) => void;
  onWalkIn: () => void;
  onMore: () => void;
  waiting: number;
  inService: number;
  live: boolean;
}

export function BottomNav({ tab, onTab, onWalkIn, onMore, waiting, inService, live }: Props) {
  const navigate = useNavigate();
  const items: { label: string; icon: typeof ShoppingBag; active?: boolean; run: () => void; badges?: boolean }[] = [
    { label: "Techs", icon: UserCog, active: tab === "techs", run: () => onTab("techs") },
    { label: "POS", icon: ShoppingBag, active: tab === "pos", run: () => onTab("pos") },
    { label: "Checked In", icon: Users, active: tab === "board", run: () => onTab("board"), badges: true },
    { label: "Calendar", icon: CalendarDays, run: () => navigate("/calendar") },
    { label: "Customers", icon: UserRound, run: () => navigate("/client-lookup") },
    { label: "Walk-in", icon: Footprints, run: onWalkIn },
    { label: "Reports", icon: ArrowUpRight, run: () => navigate("/reports") },
    { label: "Messages", icon: Bell, run: () => navigate("/sms-inbox") },
    { label: "More", icon: MoreHorizontal, run: onMore },
  ];
  return (
    <nav className="bottom-nav" data-testid="nail-bottom-nav">
      {items.map(({ label, icon: Icon, active, run, badges }) => (
        <button key={label} type="button" onClick={run} className={active ? "active" : ""} data-testid={`nail-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <Icon size={21} />
          <span>{label}</span>
          {badges && waiting > 0 && <i className="nav-badge-waiting">{waiting}</i>}
          {badges && inService > 0 && <i className="nav-badge-service">{inService}</i>}
        </button>
      ))}
      <div className="connection" data-testid="nail-live" style={live ? undefined : { color: "#8b94a0" }}>
        <span style={live ? undefined : { background: "#5d6571", boxShadow: "none" }} /> {live ? "Connected" : "Offline"}
      </div>
    </nav>
  );
}
