import { useEffect, useState } from "react";
import { salonTimeZone } from "@/lib/salonClock";
import { useQuery } from "@tanstack/react-query";
import { getStationDeviceId } from "@/lib/stationDevice";
import { X } from "lucide-react";
import { nailOffline, type LocalRecord, type Op } from "@/lib/nail-offline";
import { syncEngine } from "@/lib/sync-engine";
import { hasLocalHub, localHub, type HubSnapshot } from "@/lib/local-hub";
import { techLabel } from "./techName";

const WHAT: Record<Op["type"], string> = {
  "client.create": "New client", "walkin.create": "Check-in", "walkin.assign": "Client taken", "ticket.create": "Ticket", "ticket.start": "Start service",
  "ticket.update": "Ticket change", "ticket.reassign": "Barber change", "ticket.cancel": "Cancel ticket", "ticket.checkout": "Payment",
};

/**
 * What this tablet has saved and not yet sent: each change, whether it is waiting or was refused by the
 * server, and for a refused one the reason with Try again / Remove. Nothing here is ever removed by itself.
 */
/**
 * This tablet's address on the salon's Wi-Fi and the hub's (the tablet the others connect to with no internet), with
 * Update: both are looked up again, saved on the server and on this tablet, and the hub link is brought up again.
 * Only in the Certxa app, where the hub runs.
 */
function HubInfo() {
  const [info, setInfo] = useState<HubSnapshot>(() => localHub.snapshot());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void localHub.lookupAddress().then(() => { if (live) setInfo(localHub.snapshot()); });
    const off = localHub.onStatusChange(() => { if (live) setInfo(localHub.snapshot()); });
    return () => { live = false; off(); };
  }, []);
  const update = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await localHub.refresh();
      setInfo(r);
      const linked = r.status === "serving" || r.status === "connected";
      setResult(!linked
        ? { text: r.hubAddress ? `Could not connect to the hub at ${r.hubAddress}.` : "No hub address yet. Make sure the main front desk tablet is on, then press Update again.", ok: false }
        : r.savedOnServer ? { text: "Updated and saved on the server and this tablet.", ok: true }
        : { text: "Updated. No internet, so it is saved on this tablet only.", ok: true });
    } catch (err) {
      setResult({ text: (err as Error)?.message || "Could not update.", ok: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="assign-create-item" style={{ cursor: "default", flexWrap: "wrap", gap: 8 }} data-testid="barber-hub-info">
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="assign-create-name" data-testid="barber-hub-own-ip">{`Network IP: ${info.ownAddress ?? "—"}`}</div>
        <div className="assign-create-name" data-testid="barber-hub-ip">{`Hub IP: ${info.hubAddress ?? "—"}`}</div>
      </div>
      <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={busy} onClick={() => void update()} data-testid="barber-hub-update">
        {busy ? "UPDATING…" : "UPDATE"}
      </button>
      {result && <div className={result.ok ? "assign-create-hint" : "gift-error"} style={{ flexBasis: "100%" }} role="status">{result.text}</div>}
    </div>
  );
}

/**
 * Which station this tablet is, the main station and the salon hub (owner, 2026-11-02: here, by the connection,
 * instead of a Change Station page in the Manager menu). Read-only; a tablet with no station picks one from Manager ›
 * Station. Needs the internet; with none it says so.
 */
function StationInfo() {
  const deviceId = getStationDeviceId();
  const { data, isLoading, isError } = useQuery<{ stations: { id: number; name: string; isMain: boolean; mine: boolean }[]; hub?: { registerId: number | null; address: string | null } }>({
    queryKey: ["/api/registers/stations", deviceId],
    queryFn: async () => {
      const res = await fetch(`/api/registers/stations?deviceId=${encodeURIComponent(deviceId)}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the stations");
      return res.json();
    },
    retry: false,
  });
  if (isLoading) return null;
  if (isError || !data) return <div className="assign-create-hint" data-testid="barber-station-info">Station details need the internet.</div>;
  if (data.stations.length === 0) return null;
  const mine = data.stations.find((s) => s.mine) ?? null;
  const main = data.stations.find((s) => s.isMain) ?? null;
  const hubStation = data.hub?.registerId != null ? data.stations.find((s) => s.id === data.hub!.registerId) ?? null : null;
  return (
    <div className="assign-create-item" style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", gap: 2 }} data-testid="barber-station-info">
      <div className="assign-create-name">{`This tablet: ${mine?.name ?? "None"}`}</div>
      <div className="assign-create-name">{`Main station: ${main?.name ?? "None"}`}</div>
      <div className="assign-create-name">{hubStation ? `Shop hub: ${data.hub?.address ? `${hubStation.name} · ${data.hub.address}` : hubStation.name}` : "Shop hub: not running yet"}</div>
    </div>
  );
}

export function OfflineQueueSheet({ storeId, offline, onClose }: { storeId: number; offline: boolean; onClose: () => void }) {
  const [ops, setOps] = useState<Op[]>([]);
  const [recs, setRecs] = useState<LocalRecord[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [others, setOthers] = useState(0);
  useEffect(() => {
    const load = () => {
      void nailOffline.ops(storeId).then((all) => setOps(all.filter((o) => o.state !== "done"))).catch(() => {});
      void nailOffline.records(storeId).then(setRecs).catch(() => {});
      void nailOffline.lastSyncAt(storeId).then(setLastSync).catch(() => {});
      void nailOffline.heldForOtherSalons(storeId).then(setOthers).catch(() => {});
    };
    load();
    return nailOffline.onChange(load);
  }, [storeId]);
  const rec = (o: Op) => recs.find((x) => x.id === o.recordId);
  const who = (o: Op) => {
    const r = rec(o);
    return !r ? "" : r.kind === "client" ? r.name : r.clientName;
  };
  // A cash payment shows its amount; a ticket whose technician was picked on this tablet says so.
  const detail = (o: Op) => {
    const r = rec(o);
    if (o.type === "ticket.checkout" && r && (r.kind === "ticket" || r.kind === "patch") && r.paid) return ` · $${r.paid.cash.toFixed(2)}`;
    if (o.type === "ticket.create" && r?.kind === "ticket" && r.staff) return ` · ${techLabel(r.staff.name, r.staff.id)}${r.assignedOffline ? " (assigned offline)" : ""}`;
    return "";
  };
  const cash = ops.filter((o) => o.type === "ticket.checkout").reduce((sum, o) => { const r = rec(o); return sum + (r && (r.kind === "ticket" || r.kind === "patch") ? r.paid?.cash ?? 0 : 0); }, 0);
  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" data-testid="nail-offline-queue">
        <div className="assign-create-header">
          <div>
            <h2>Saved on this tablet</h2>
            <p>{offline ? "No connection. These will be sent when it is back." : "Sending to the server."}</p>
          </div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="assign-create-list">
          <StationInfo />
          {hasLocalHub() && <HubInfo />}
          {nailOffline.storageProblem() && (
            <div className="gift-error" data-testid="barber-storage-problem">
              {nailOffline.storageProblem()!.kind === "full" ? "This tablet's storage is full." : "This tablet cannot save right now."}
              {" "}{"New changes will not be saved until this is fixed. Nothing already saved has been removed. Free up space on the tablet or restart it, and tell your manager."}
            </div>
          )}
          {syncEngine.needsSignIn() && <div className="gift-error" data-testid="barber-signin-needed">This tablet has been signed out. Everything below is kept and will be sent as soon as someone signs in to the shop again.</div>}
          <div className="assign-create-hint" data-testid="barber-last-sync">
            {lastSync ? `Last sent to the server: ${new Date(lastSync).toLocaleString([], { timeZone: salonTimeZone(), month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Nothing has been sent from this tablet yet."}
          </div>
          {others > 0 && <div className="assign-create-hint">{others === 1 ? "1 saved change belongs to another shop and will be sent when that shop signs in on this tablet." : `${others} saved changes belong to another shop and will be sent when that shop signs in on this tablet.`}</div>}
          {ops.length === 0 && <div className="assign-create-hint">Everything has been sent.</div>}
          {cash > 0 && <div className="assign-create-hint" data-testid="barber-queued-cash-total">{`Cash taken on this tablet and not yet confirmed by the server: $${cash.toFixed(2)}`}</div>}
          {ops.map((o) => (
            <div key={o.id} className="assign-create-item" style={{ cursor: "default", flexWrap: "wrap" }} data-testid={`barber-queued-${o.type}`}>
              <span className="assign-create-name">{WHAT[o.type]}{who(o) ? ` · ${who(o)}` : ""}{detail(o)}</span>
              <span className="assign-create-status">{o.state !== "attention" ? "Waiting to send" : o.conflict ? "Changed on another device" : "Refused by the server"}</span>
              {o.state === "attention" && (
                <div style={{ flexBasis: "100%", marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="gift-error" style={{ flex: 1, minWidth: 180 }}>{o.lastError}</span>
                  <button type="button" className="assign-create-btn assign-create-btn-ready" onClick={() => void nailOffline.retry(o.id).then(() => syncEngine.runSync(storeId))}>TRY AGAIN</button>
                  {o.type === "ticket.create" && rec(o)?.kind === "ticket" && (rec(o) as any).staff && (
                    <button type="button" className="assign-create-btn" onClick={() => void nailOffline.sendWithoutTechnician(o.id).then(() => syncEngine.runSync(storeId))}>LET THE TURN LINE DECIDE</button>
                  )}
                  <button type="button" className="assign-create-btn" onClick={() => {
                    const warning = o.type === "ticket.checkout"
                      ? "The cash for this sale has already been taken. Removing it here means the sale will NOT be recorded — it must then be entered by hand. Remove it?"
                      : "Remove this from the tablet? It will not be sent.";
                    if (window.confirm(warning)) void nailOffline.discard(o.id);
                  }}>REMOVE</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
