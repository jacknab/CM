import { SPACE_STATUS_LABELS, type SpaceStatus } from "@shared/rentalSpaces";

// Status is always communicated by the text label — the dot is a secondary,
// glanceable cue, never the only signal (step 4: "do not use color alone").
const DOT_COLOR: Record<SpaceStatus, string> = {
  available: "bg-emerald-500",
  occupied: "bg-neutral-700",
  reserved: "bg-amber-500",
  maintenance: "bg-rose-500",
  inactive: "bg-neutral-300",
};

const TEXT_COLOR: Record<SpaceStatus, string> = {
  available: "text-emerald-700",
  occupied: "text-neutral-700",
  reserved: "text-amber-700",
  maintenance: "text-rose-700",
  inactive: "text-neutral-400",
};

export default function SpaceStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const s = status as SpaceStatus;
  const label = SPACE_STATUS_LABELS[s] ?? status;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${TEXT_COLOR[s] ?? "text-neutral-500"} ${className}`}>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLOR[s] ?? "bg-neutral-300"}`} />
      {label}
    </span>
  );
}
