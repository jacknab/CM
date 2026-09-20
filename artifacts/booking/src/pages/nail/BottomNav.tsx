import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Bell, CalendarDays, Footprints, MoreHorizontal, ShoppingBag, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type NailTab = "pos" | "board";

interface Props {
  tab: NailTab;
  onTab: (t: NailTab) => void;
  onWalkIn: () => void;
  waiting: number;
  inService: number;
  live: boolean;
}

export function BottomNav({ tab, onTab, onWalkIn, waiting, inService, live }: Props) {
  const navigate = useNavigate();
  const items: { label: string; icon: typeof ShoppingBag; active?: boolean; run: () => void; badge?: React.ReactNode }[] = [
    { label: "POS", icon: ShoppingBag, active: tab === "pos", run: () => onTab("pos") },
    {
      label: "Checked In", icon: Users, active: tab === "board", run: () => onTab("board"),
      badge: waiting + inService > 0 ? (
        <span className="absolute -top-1 -right-2 flex gap-0.5">
          {waiting > 0 && <i className="not-italic rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">{waiting}</i>}
          {inService > 0 && <i className="not-italic rounded-full bg-secondary text-foreground text-[10px] font-bold px-1.5">{inService}</i>}
        </span>
      ) : null,
    },
    { label: "Calendar", icon: CalendarDays, run: () => navigate("/calendar") },
    { label: "Clients", icon: UserRound, run: () => navigate("/client-lookup") },
    { label: "Walk-in", icon: Footprints, run: onWalkIn },
    { label: "Reports", icon: ArrowUpRight, run: () => navigate("/reports") },
    { label: "Messages", icon: Bell, run: () => navigate("/sms-inbox") },
    { label: "More", icon: MoreHorizontal, run: () => navigate("/settings") },
  ];
  return (
    <nav className="h-[68px] shrink-0 flex items-stretch border-t border-border bg-card" data-testid="nail-bottom-nav">
      {items.map(({ label, icon: Icon, active, run, badge }) => (
        <button key={label} type="button" onClick={run} data-testid={`nail-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
          className={cn("relative flex-1 flex flex-col items-center justify-center gap-1 transition-colors", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
          <span className="relative"><Icon className="w-5 h-5" strokeWidth={active ? 2.3 : 1.7} />{badge}</span>
          <span className="text-[10px] font-semibold tracking-wide">{label}</span>
        </button>
      ))}
      <div className="flex items-center gap-1.5 px-4 text-[11px] text-muted-foreground" data-testid="nail-live">
        <span className={cn("w-2 h-2 rounded-full", live ? "bg-primary" : "bg-muted-foreground/50")} />
        {live ? "Live" : "Offline"}
      </div>
    </nav>
  );
}
