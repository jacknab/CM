import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCashDrawers } from "@/hooks/use-cash-drawers";

/**
 * Manager menu → Station Drawer (owner, 2026-11-02): the cash drawer this tablet's POS station uses. A station without
 * one can't take cash. Several stations may share a drawer. A station can leave a drawer that has taken cash only
 * after that drawer's Day Close (the server says so).
 */
export function StationDrawerSheet({ storeId, registerId, stationName, onClose }: {
  storeId: number;
  registerId: number;
  stationName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: drawers, isLoading } = useCashDrawers(storeId);
  const active = (drawers ?? []).filter((d) => d.isActive !== false);
  const current = active.find((d) => d.registerIds.includes(registerId))?.id ?? null;
  const [busy, setBusy] = useState<number | "none" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (drawerId: number | null) => {
    if (drawerId === current || busy != null) return;
    setBusy(drawerId ?? "none");
    setError(null);
    try {
      const res = await fetch(`/api/registers/${registerId}/cash-drawer`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashDrawerId: drawerId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message || "Could not change the cash drawer.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/cash-drawers?storeId=${storeId}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers/station"] }),
      ]);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "Could not change the cash drawer.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" data-testid="barber-station-drawer">
        <div className="assign-create-header">
          <div>
            <h2>{`${stationName} cash drawer`}</h2>
            <p>The cash drawer this POS uses. Without one it can't take cash.</p>
          </div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="assign-create-list">
          {isLoading && <div className="assign-create-hint">Loading…</div>}
          {!isLoading && active.length === 0 && <div className="assign-create-hint">No cash drawers yet. Add one in Settings › Cash Drawers.</div>}
          {active.map((d) => (
            <button key={d.id} type="button" className="assign-create-item" disabled={busy != null} onClick={() => void choose(d.id)} data-testid={`barber-station-drawer-${d.id}`}>
              <span className="assign-create-name">{d.name}</span>
              <span className="assign-create-status">{busy === d.id ? "Saving…" : d.id === current ? "This POS" : ""}</span>
            </button>
          ))}
          {active.length > 0 && (
            <button type="button" className="assign-create-item" disabled={busy != null} onClick={() => void choose(null)} data-testid="barber-station-drawer-none">
              <span className="assign-create-name">No cash drawer</span>
              <span className="assign-create-status">{busy === "none" ? "Saving…" : current == null ? "This POS" : ""}</span>
            </button>
          )}
          {error && <div className="gift-error" role="status">{error}</div>}
        </div>
      </div>
    </>
  );
}
