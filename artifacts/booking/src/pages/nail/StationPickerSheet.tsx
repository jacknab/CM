import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localHub } from "@/lib/local-hub";
import { X } from "lucide-react";
import { getStationDeviceId } from "@/lib/stationDevice";

interface StationRow {
  id: number;
  name: string;
  isMain: boolean;
  /** This tablet holds it. */
  mine: boolean;
  /** Another tablet holds it: when that tablet last checked in. Null with mine false = free. */
  seenAt: string | null;
}

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/**
 * Manager menu → Station (owner, 2026-11-02): put this tablet on the station it belongs to. After a reset or a
 * reinstall a tablet comes back as a new one and is given whichever station is free — it could lose the main
 * station (and with it the salon hub), its cash drawer and its customer screen. The station decides all of those.
 */
export function StationPickerSheet({ onChoose, onClose }: {
  onChoose: (id: number) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const deviceId = getStationDeviceId();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<{ stations: StationRow[]; hub?: { registerId: number | null; address: string | null } }>({
    queryKey: ["/api/registers/stations", deviceId],
    queryFn: async () => {
      const res = await fetch(`/api/registers/stations?deviceId=${encodeURIComponent(deviceId)}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the stations");
      return res.json();
    },
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mainBusy, setMainBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const mine = data?.stations.find((s) => s.mine) ?? null;
  const main = data?.stations.find((s) => s.isMain) ?? null;
  const hubStation = data?.hub?.registerId != null ? data.stations.find((s) => s.id === data.hub!.registerId) ?? null : null;

  // The setup in one tap (owner, 2026-11-02): this tablet's station becomes the main one, so this tablet runs the
  // salon hub that keeps the tablets working together with no internet; the hub is updated straight away.
  const makeThisMain = async () => {
    if (!mine || mainBusy) return;
    if (!window.confirm(`Make ${mine.name} the main station? This tablet will run the salon hub that keeps the tablets working together when the internet is down.`)) return;
    setMainBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/registers/${mine.id}/make-main`, { method: "PUT", credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message || "Could not make this the main station.");
      queryClient.invalidateQueries({ queryKey: ["/api/registers"], predicate: (q) => String(q.queryKey[0]).startsWith("/api/registers") });
      await localHub.refresh().catch(() => null);
      await refetch();
      setDone("This tablet is now the main station and runs the salon hub.");
    } catch (err) {
      setError((err as Error)?.message || "Could not make this the main station.");
    } finally {
      setMainBusy(false);
    }
  };

  const choose = async (s: StationRow) => {
    if (s.mine || busy != null) return;
    if (s.seenAt && !window.confirm(`${s.name} is in use by another tablet (seen ${ago(s.seenAt)}). Move this tablet to ${s.name}? The other tablet moves to a free station.`)) return;
    setBusy(s.id);
    setError(null);
    const r = await onChoose(s.id);
    setBusy(null);
    if (!r.ok) { setError(r.error ?? "Could not move this tablet to that station."); return; }
    await refetch();
    onClose();
  };

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" data-testid="nail-station-picker">
        <div className="assign-create-header">
          <div>
            <h2>This tablet's station</h2>
            <p>This tablet uses the station's cash drawer and customer screen. The main station runs the salon hub.</p>
          </div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="assign-create-list">
          {isLoading && <div className="assign-create-hint">Loading…</div>}
          {data && (
            <div className="assign-create-item" style={{ cursor: "default", flexWrap: "wrap", gap: 8 }} data-testid="nail-station-setup">
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="assign-create-name">{`This tablet: ${mine?.name ?? "None"}`}</div>
                <div className="assign-create-name">{`Main station: ${main?.name ?? "None"}`}</div>
                <div className="assign-create-name" data-testid="nail-station-hub">
                  {hubStation ? `Salon hub: ${data.hub?.address ? `${hubStation.name} · ${data.hub.address}` : hubStation.name}` : "Salon hub: not running yet"}
                </div>
              </div>
              {mine && !mine.isMain && (
                <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={mainBusy} onClick={() => void makeThisMain()} data-testid="nail-station-make-main">
                  {mainBusy ? "SAVING…" : "MAKE THIS TABLET THE MAIN"}
                </button>
              )}
              {done && <div className="assign-create-hint" style={{ flexBasis: "100%" }} role="status">{done}</div>}
            </div>
          )}
          {!isLoading && !data && <div className="gift-error">Could not load the stations. Check the internet and try again.</div>}
          {data?.stations.map((s) => (
            <button
              key={s.id}
              type="button"
              className="assign-create-item"
              disabled={busy != null}
              onClick={() => void choose(s)}
              data-testid={`nail-station-${s.id}`}
            >
              <span className="assign-create-name">{s.isMain ? `${s.name} · Main` : s.name}</span>
              <span className="assign-create-status">
                {busy === s.id ? "Moving…" : s.mine ? "This tablet" : s.seenAt ? `In use · seen ${ago(s.seenAt)}` : "Free"}
              </span>
            </button>
          ))}
          {error && <div className="gift-error" role="status">{error}</div>}
        </div>
      </div>
    </>
  );
}
