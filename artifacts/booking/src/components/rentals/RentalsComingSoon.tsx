import type { LucideIcon } from "lucide-react";

/** Deliberate placeholder for nav destinations not built in this phase — no fake data, no fake controls. */
export default function RentalsComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        <Icon size={20} />
      </div>
      <p className="font-[Outfit] text-[15px] font-semibold text-neutral-800">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">{description}</p>
      <span className="mt-4 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Coming in a future phase
      </span>
    </div>
  );
}
