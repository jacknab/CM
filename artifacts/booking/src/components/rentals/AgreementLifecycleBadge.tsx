import { AGREEMENT_LIFECYCLE_LABELS, type AgreementLifecycle } from "@shared/rentalAgreements";

// Status is always communicated by the text label — the dot is a secondary,
// glanceable cue, never the only signal.
const DOT_COLOR: Record<AgreementLifecycle, string> = {
  draft: "bg-neutral-300",
  upcoming: "bg-sky-500",
  active: "bg-emerald-500",
  ending: "bg-amber-500",
  ended: "bg-neutral-400",
  terminated: "bg-rose-500",
};

const TEXT_COLOR: Record<AgreementLifecycle, string> = {
  draft: "text-neutral-400",
  upcoming: "text-sky-700",
  active: "text-emerald-700",
  ending: "text-amber-700",
  ended: "text-neutral-500",
  terminated: "text-rose-700",
};

export default function AgreementLifecycleBadge({ lifecycle, className = "" }: { lifecycle: string; className?: string }) {
  const s = lifecycle as AgreementLifecycle;
  const label = AGREEMENT_LIFECYCLE_LABELS[s] ?? lifecycle;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${TEXT_COLOR[s] ?? "text-neutral-500"} ${className}`}>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLOR[s] ?? "bg-neutral-300"}`} />
      {label}
    </span>
  );
}
