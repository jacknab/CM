import { Hash, LogIn, MoreHorizontal, Users, UserCog, type LucideIcon } from "lucide-react";
import { useNailText } from "./i18n";

export type NailTab = "queue" | "techs" | "pos";

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
  const { t: tx } = useNailText();
  const items: { id: string; label: string; icon: LucideIcon; active?: boolean; run: () => void; badgeCount?: number }[] = [
    { id: "Queue", label: tx("queue"), icon: Users, active: tab === "queue", run: () => onTab("queue"), badgeCount: waiting },
    { id: "Techs", label: tx("techs"), icon: UserCog, active: tab === "techs", run: () => onTab("techs") },
    { id: "Ticket#", label: tx("ticketNo"), icon: Hash, run: onLookupByNumber },
    { id: "Check-In", label: tx("checkIn"), icon: LogIn, run: onCheckIn },
    { id: "More", label: tx("more"), icon: MoreHorizontal, run: onMore },
  ];
  return (
    <nav className="bottom-nav" data-testid="nail-bottom-nav">
      {items.map(({ id, label, icon: Icon, active, run, badgeCount }) => (
        <button key={id} type="button" onClick={run} className={active ? "active" : ""} data-testid={`nail-nav-${id.toLowerCase().replace(/\s+/g, "-")}`}>
          <Icon size={28} />
          <span>{label}</span>
          {!!badgeCount && <i className="nav-badge-service">{badgeCount}</i>}
        </button>
      ))}
      <div className="connection" data-testid="nail-live" style={live ? undefined : { color: "#8b94a0" }}>
        <span style={live ? undefined : { background: "#5d6571", boxShadow: "none" }} /> {live ? tx("connected") : tx("offline")}
      </div>
    </nav>
  );
}
