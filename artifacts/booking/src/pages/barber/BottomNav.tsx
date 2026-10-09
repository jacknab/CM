import { Hash, LogIn, MoreHorizontal, Users, UserCog, type LucideIcon } from "lucide-react";

export type NailTab = "queue" | "techs" | "pos" | "board";

interface Props {
  tab: NailTab;
  onTab: (t: NailTab) => void;
  onCheckIn: () => void;
  onMore: () => void;
  /** Opens the "# 123" manual ticket lookup — was previously its own button in the Queue tab's
   *  own header; now lives here so it's reachable from every tab, not just Queue. */
  onLookupByNumber: () => void;
  waiting: number;
  live: boolean;
}

// POS has no footer button — it's still opened from inside the app (ticket taps, check-in, checkout).
// "In Service" also has no footer button — that view now lives inside the Queue tab (its "In
// Service" stat tile jumps straight to it), so a separate nav entry for the old standalone board
// would just be a second way to reach a page already reachable from Queue.
export function BottomNav({ tab, onTab, onCheckIn, onMore, onLookupByNumber, waiting, live }: Props) {
  const items: { label: string; icon: LucideIcon; active?: boolean; run: () => void; badgeCount?: number }[] = [
    { label: "Queue", icon: Users, active: tab === "queue", run: () => onTab("queue"), badgeCount: waiting },
    { label: "Barbers", icon: UserCog, active: tab === "techs", run: () => onTab("techs") },
    { label: "Ticket#", icon: Hash, run: onLookupByNumber },
    { label: "Check-In", icon: LogIn, run: onCheckIn },
    { label: "More", icon: MoreHorizontal, run: onMore },
  ];
  return (
    <nav className="bottom-nav" data-testid="barber-bottom-nav">
      {items.map(({ label, icon: Icon, active, run, badgeCount }) => (
        <button key={label} type="button" onClick={run} className={active ? "active" : ""} data-testid={`barber-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <Icon size={28} />
          <span>{label}</span>
          {!!badgeCount && <i className="nav-badge-service">{badgeCount}</i>}
        </button>
      ))}
      <div className="connection" data-testid="barber-live" style={live ? undefined : { color: "#8b94a0" }}>
        <span style={live ? undefined : { background: "#5d6571", boxShadow: "none" }} /> {live ? "Connected" : "Offline"}
      </div>
    </nav>
  );
}
