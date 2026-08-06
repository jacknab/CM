import { useNetworkStatus } from "@/hooks/use-network-status";
import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncEngine } from "@/lib/sync-engine";

export function OfflineBanner() {
  const status = useNetworkStatus();
  const isOnline = status === "online" || status === "syncing";
  const [prevOnline, setPrevOnline] = useState(isOnline);
  const [showReconnected, setShowReconnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!prevOnline && isOnline) {
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 3500);
      return () => clearTimeout(t);
    }
    setPrevOnline(isOnline);
    return undefined;
  }, [isOnline, prevOnline]);

  useEffect(() => {
    if (isOnline) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      syncEngine.getPendingCount().then((n) => {
        if (!cancelled) setPendingCount(n);
      }).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOnline]);

  useEffect(() => {
    return syncEngine.onQueueChange(() => {
      syncEngine.getPendingCount().then(setPendingCount).catch(() => {});
    });
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg",
          showReconnected
            ? "bg-emerald-600 text-white"
            : "bg-amber-500 text-white"
        )}
      >
        {showReconnected ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Back online — syncing…</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>
              Offline mode
              {pendingCount > 0 && (
                <span className="ml-1 bg-white/25 rounded-full px-1.5 py-px text-[10px] font-semibold">
                  {pendingCount} pending
                </span>
              )}
            </span>
            <RefreshCw className="h-3 w-3 animate-spin opacity-70" />
          </>
        )}
      </div>
    </div>
  );
}
