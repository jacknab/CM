/**
 * Manager › Online Check-In on /barber (plans/online-checkin-line.md): pause phone check-in with a reason the client
 * sees ("Back at 2 PM"), for a while or until opened again, or open it again. Everything else is in Settings ›
 * Online Check-In. Shown inside the Manager screen (its own popup box becomes the page there).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LINE_SETTINGS_KEY, useSaveLine, type LineSettings } from "@/pages/line/OnlineLineSettings";

const FOR = [{ label: "30 min", min: 30 }, { label: "1 hour", min: 60 }, { label: "2 hours", min: 120 }, { label: "Rest of today", min: null }] as const;

export function OnlineLineSheet({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery<{ settings: LineSettings; link: string }>({ queryKey: LINE_SETTINGS_KEY });
  const save = useSaveLine();
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<number | null>(60);
  const [error, setError] = useState<string | null>(null);
  const s = data?.settings;
  // "Rest of today": paused until someone opens it again.
  const run = (body: Parameters<typeof save.mutate>[0]) => { setError(null); save.mutate(body, { onError: (e: any) => setError(e?.message ?? "Not saved") }); };

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-labelledby="barber-online-line-title" data-testid="barber-online-line" style={{ width: "min(560px, 94vw)" }}>
        <div className="assign-create-header">
          <h2 id="barber-online-line-title">Online Check-In</h2>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {isLoading || !s ? <p className="assign-create-hint">Loading…</p> : !s.enabled ? (
            <p className="assign-create-hint">Online check-in is off. The owner turns it on in Settings › Online Check-In.</p>
          ) : s.paused ? (
            <>
              <div className="assign-create-status" style={{ fontWeight: 800 }}>
                PAUSED{s.paused.until ? ` UNTIL ${new Date(s.paused.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
              </div>
              {s.paused.reason && <p className="assign-create-hint" style={{ margin: 0 }}>Clients see: "{s.paused.reason}"</p>}
              <button type="button" className="assign-create-btn assign-create-btn-ready" style={{ height: 64, fontSize: 20 }} disabled={save.isPending}
                onClick={() => run({ paused: null })} data-testid="barber-online-line-open">OPEN ONLINE CHECK-IN</button>
            </>
          ) : (
            <>
              <div className="assign-create-status" style={{ fontWeight: 800 }}>OPEN</div>
              <p className="assign-create-hint" style={{ margin: 0 }}>Clients can join the line from their phone. Pause it when the shop is too busy or a barber is out.</p>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 700 }}>
                What clients see (optional)
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="Back at 2 PM"
                  style={{ fontSize: 18, padding: "12px 14px", borderRadius: 12, border: "1.5px solid #c9d2de" }} data-testid="barber-online-line-reason" />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {FOR.map((f) => (
                  <button type="button" key={f.label} className={`assign-create-btn ${minutes === f.min ? "assign-create-btn-ready" : ""}`} style={{ height: 52 }}
                    onClick={() => setMinutes(f.min)}>{f.label}</button>
                ))}
              </div>
              <button type="button" className="assign-create-btn assign-create-btn-ready" style={{ height: 64, fontSize: 20 }} disabled={save.isPending}
                onClick={() => run({ paused: { reason: reason.trim(), minutes } })} data-testid="barber-online-line-pause">PAUSE ONLINE CHECK-IN</button>
            </>
          )}
          {error && <p className="assign-create-error">{error}</p>}
        </div>
      </div>
    </>
  );
}
