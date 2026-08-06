import { useEffect, useRef } from "react";
import { X, AlertTriangle, RefreshCw, Users, Merge } from "lucide-react";
import { useSyncConflicts, type ConflictEntry, dismissConflict } from "@/hooks/use-sync-conflicts";

const ICONS: Record<ConflictEntry["kind"], React.ReactNode> = {
  booking_updated: <RefreshCw className="w-4 h-4 shrink-0" />,
  walkin_merged: <Merge className="w-4 h-4 shrink-0" />,
  staff_changed: <Users className="w-4 h-4 shrink-0" />,
  batch_resumed: <RefreshCw className="w-4 h-4 shrink-0" />,
  action_rejected: <AlertTriangle className="w-4 h-4 shrink-0" />,
  generic: <AlertTriangle className="w-4 h-4 shrink-0" />,
};

const LABELS: Record<ConflictEntry["kind"], string> = {
  booking_updated: "Booking updated by server",
  walkin_merged: "Walk-in merged with existing record",
  staff_changed: "Staff assignment changed due to sync conflict",
  batch_resumed: "Sync resumed from last checkpoint",
  action_rejected: "Action rejected by server",
  generic: "Sync conflict",
};

function ConflictItem({ entry }: { entry: ConflictEntry }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => dismissConflict(entry.id), 8_000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [entry.id]);

  return (
    <div className="flex items-start gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-md px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 max-w-[320px] animate-in slide-in-from-right-4 fade-in duration-200">
      <span className="text-amber-500 mt-0.5">{ICONS[entry.kind]}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium leading-tight">{LABELS[entry.kind]}</div>
        {entry.detail && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate" title={entry.detail}>
            {entry.detail}
          </div>
        )}
      </div>
      <button
        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-1 mt-0.5 shrink-0"
        onClick={() => dismissConflict(entry.id)}
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function SyncConflictPanel() {
  const conflicts = useSyncConflicts();

  if (conflicts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Sync notifications"
    >
      {conflicts.slice(0, 4).map((entry) => (
        <div key={entry.id} className="pointer-events-auto">
          <ConflictItem entry={entry} />
        </div>
      ))}
    </div>
  );
}
