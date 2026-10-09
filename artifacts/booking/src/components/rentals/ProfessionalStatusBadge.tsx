import { PROFESSIONAL_STATUS_LABELS, type ProfessionalStatus } from "@shared/rentalProfessionals";

// Status is always communicated by the text label — the dot is a secondary,
// glanceable cue, never the only signal.
const DOT_COLOR: Record<ProfessionalStatus, string> = {
  active: "bg-emerald-500",
  pending: "bg-amber-500",
  inactive: "bg-neutral-300",
  former: "bg-neutral-400",
};

const TEXT_COLOR: Record<ProfessionalStatus, string> = {
  active: "text-emerald-700",
  pending: "text-amber-700",
  inactive: "text-neutral-400",
  former: "text-neutral-500",
};

export default function ProfessionalStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const s = status as ProfessionalStatus;
  const label = PROFESSIONAL_STATUS_LABELS[s] ?? status;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${TEXT_COLOR[s] ?? "text-neutral-500"} ${className}`}>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLOR[s] ?? "bg-neutral-300"}`} />
      {label}
    </span>
  );
}
