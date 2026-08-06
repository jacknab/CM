import { useReconciliationStatus } from "@/hooks/use-reconciliation-status";

export function OfflineStatusBanner() {
  const { bannerState } = useReconciliationStatus();

  if (bannerState === "online") return null;

  const config: Record<
    Exclude<typeof bannerState, "online">,
    { label: string; bg: string; dot: string }
  > = {
    reconciling: {
      label: "Syncing…",
      bg: "bg-blue-600",
      dot: "animate-pulse bg-white",
    },
    syncing: {
      label: "Syncing…",
      bg: "bg-blue-500",
      dot: "animate-pulse bg-white",
    },
    offline_cached: {
      label: "Offline",
      bg: "bg-amber-500",
      dot: "bg-white",
    },
    offline_uncached: {
      label: "Offline",
      bg: "bg-red-600",
      dot: "bg-white",
    },
  };

  const { label, bg, dot } = config[bannerState];

  return (
    <div
      className="fixed top-2 inset-x-0 z-50 flex justify-center pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-xs font-medium shadow-md ${bg} transition-colors duration-300`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        {label}
      </div>
    </div>
  );
}
