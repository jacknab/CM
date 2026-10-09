import { CHARGE_DISPLAY_LABELS, type ChargeDisplayState } from "@shared/rentCharges";

// Status is always communicated by the text label — the dot is a secondary,
// glanceable cue, never the only signal. Overdue uses rose (attention) but
// nothing flashes or shouts — Section 38 explicitly warns against alarmist design.
const DOT_COLOR: Record<ChargeDisplayState, string> = {
  upcoming: "bg-sky-500",
  due: "bg-amber-500",
  overdue: "bg-rose-500",
  paid: "bg-emerald-500",
  voided: "bg-neutral-300",
};

const TEXT_COLOR: Record<ChargeDisplayState, string> = {
  upcoming: "text-sky-700",
  due: "text-amber-700",
  overdue: "text-rose-700",
  paid: "text-emerald-700",
  voided: "text-neutral-400",
};

export default function ChargeStateBadge({ state, className = "" }: { state: string; className?: string }) {
  const s = state as ChargeDisplayState;
  const label = CHARGE_DISPLAY_LABELS[s] ?? state;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${TEXT_COLOR[s] ?? "text-neutral-500"} ${className}`}>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLOR[s] ?? "bg-neutral-300"}`} />
      {label}
    </span>
  );
}
