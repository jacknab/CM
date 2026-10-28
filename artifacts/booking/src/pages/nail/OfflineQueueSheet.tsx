import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { nailOffline, type LocalRecord, type Op } from "@/lib/nail-offline";
import { syncEngine } from "@/lib/sync-engine";
import { techLabel } from "./techName";

const WHAT: Record<Op["type"], string> = {
  "client.create": "New client", "walkin.create": "Check-in", "ticket.create": "Ticket", "ticket.start": "Start service",
  "ticket.update": "Ticket change", "ticket.reassign": "Technician change", "ticket.cancel": "Cancel ticket", "ticket.checkout": "Cash payment",
};

/**
 * What this tablet has saved and not yet sent: each change, whether it is waiting or was refused by the
 * server, and for a refused one the reason with Try again / Remove. Nothing here is ever removed by itself.
 */
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
          {nailOffline.storageProblem() && (
            <div className="gift-error" data-testid="nail-storage-problem">
              {nailOffline.storageProblem()!.kind === "full" ? "This tablet's storage is full." : "This tablet cannot save right now."}
              {" "}New changes will not be saved until this is fixed. Nothing already saved has been removed. Free up space on the tablet or restart it, and tell your manager.
            </div>
          )}
          {syncEngine.needsSignIn() && <div className="gift-error" data-testid="nail-signin-needed">This tablet has been signed out. Everything below is kept and will be sent as soon as someone signs in to the salon again.</div>}
          <div className="assign-create-hint" data-testid="nail-last-sync">
            {lastSync ? `Last sent to the server: ${new Date(lastSync).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Nothing has been sent from this tablet yet."}
          </div>
          {others > 0 && <div className="assign-create-hint">{others} saved change{others === 1 ? "" : "s"} belong{others === 1 ? "s" : ""} to another salon and will be sent when that salon signs in on this tablet.</div>}
          {ops.length === 0 && <div className="assign-create-hint">Everything has been sent.</div>}
          {cash > 0 && <div className="assign-create-hint" data-testid="nail-queued-cash-total">Cash taken on this tablet and not yet confirmed by the server: ${cash.toFixed(2)}</div>}
          {ops.map((o) => (
            <div key={o.id} className="assign-create-item" style={{ cursor: "default", flexWrap: "wrap" }} data-testid={`nail-queued-${o.type}`}>
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
