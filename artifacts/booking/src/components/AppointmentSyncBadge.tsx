import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { syncEngine } from "@/lib/sync-engine";
import type { SyncState } from "@/hooks/use-pending-sync";

interface AppointmentSyncBadgeProps {
  syncState: SyncState | undefined;
  conflictDetail?: string;
  /** entity_temp_id — for locally-created appointments (CREATE_BOOKING conflict) */
  entityTempId?: string;
  /** Server-assigned appointment ID — for update/checkin conflicts on existing appointments */
  entityRealId?: number;
}

/**
 * Inline sync status indicator shown next to the status badge on calendar cards.
 *
 * - pending / syncing → small pulsing amber dot
 * - conflict          → clickable red triangle; opens a portal popover with the
 *                       failure reason and a "Discard change" button
 */
export function AppointmentSyncBadge({
  syncState,
  conflictDetail,
  entityTempId,
  entityRealId,
}: AppointmentSyncBadgeProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, placedAbove: true });
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!syncState || syncState === "confirmed") return null;

  // ── pending / syncing ──────────────────────────────────────────────────────
  if (syncState === "pending" || syncState === "syncing") {
    return (
      <span
        className="inline-flex items-center shrink-0"
        title="Saving offline changes…"
        aria-label="Syncing"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      </span>
    );
  }

  // ── conflict ───────────────────────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = badgeRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceAbove = rect.top;
      const placedAbove = spaceAbove >= 144;
      setPos({
        top: placedAbove ? rect.top - 8 : rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 248),
        placedAbove,
      });
    }
    setOpen((v) => !v);
  };

  const handleDiscard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entityTempId) {
      await syncEngine.discardConflict(entityTempId);
    } else if (entityRealId) {
      await syncEngine.discardConflictForRealId(entityRealId);
    }
    setOpen(false);
  };

  return (
    <>
      <button
        ref={badgeRef}
        type="button"
        className="inline-flex items-center shrink-0 text-red-500 hover:text-red-700 transition-colors rounded focus:outline-none focus:ring-1 focus:ring-red-400"
        title="Sync conflict — click for details"
        aria-label="Sync conflict"
        aria-expanded={open}
        onClick={handleClick}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Sync conflict details"
            className="fixed z-[9999] bg-white border border-red-200 rounded-xl shadow-2xl p-3 w-56"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.placedAbove ? "translateY(-100%)" : "translateY(0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-red-600 font-semibold text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Sync failed
              </div>
              <button
                type="button"
                className="text-zinc-400 hover:text-zinc-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reason */}
            <p className="text-xs text-zinc-600 leading-relaxed mb-3">
              {conflictDetail || "This change couldn't be saved — the server rejected it."}
            </p>

            {/* Action */}
            <button
              type="button"
              className="w-full text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 active:bg-red-100 rounded-lg py-1.5 transition-colors"
              onClick={handleDiscard}
            >
              Discard change
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
