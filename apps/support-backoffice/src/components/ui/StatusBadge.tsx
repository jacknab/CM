import { clsx } from "clsx";

const configs: Record<string, { bg: string; text: string; dot: string }> = {
  active:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  Active:    { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  trial:     { bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500" },
  Trial:     { bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500" },
  past_due:  { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500" },
  "Past Due":{ bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500" },
  suspended: { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500" },
  Suspended: { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500" },
  cancelled: { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400" },
  Cancelled: { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400" },
  open:      { bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500" },
  resolved:  { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  in_progress:{ bg: "bg-violet-100", text: "text-violet-700",  dot: "bg-violet-500" },
};

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "xs" | "sm" }) {
  const cfg = configs[status] ?? { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide",
      cfg.bg, cfg.text,
      size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
    )}>
      <span className={clsx("rounded-full flex-shrink-0", cfg.dot, size === "xs" ? "w-1 h-1" : "w-1.5 h-1.5")} />
      {status}
    </span>
  );
}
