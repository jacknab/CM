import { useEffect, useState } from "react";
import { buildTechSlipText, type TechSlip } from "@/lib/techSlip";

type Period = "today" | "week" | "pay";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "pay", label: "Pay Period" },
];

/** Hands laid-out text to the tablet app's printer (PRINT_TEXT) and waits for its answer. */
function printOnTablet(text: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const requestId = `slip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let done = false;
    const finish = (ok: boolean, error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("certxa_native_print_result", onResult);
      resolve({ ok, error });
    };
    const timer = setTimeout(() => finish(false, "The printer did not respond. Check that it is on and connected."), 45_000);
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.requestId === requestId) finish(!!d.ok, d.error || undefined);
    };
    window.addEventListener("certxa_native_print_result", onResult);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "PRINT_TEXT", requestId, text }));
  });
}

/**
 * A technician's own pay slip, opened from the lock screen with their Tech ID: today (each ticket), this
 * week or the pay period (each day), shown on screen and printed on the receipt printer only when they
 * ask — the front desk does not print slips for everyone.
 */
export function TechSlipSheet({ staffId, staffName, timezone, onClose }: { staffId: number; staffName: string; timezone: string; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("today");
  const [slip, setSlip] = useState<TechSlip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSlip(null); setError(null); setNote(null);
    fetch(`/api/nail/tech-slip?staffId=${staffId}&period=${period}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Could not load the slip");
        if (!cancelled) setSlip(data as TechSlip);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || "Could not load the slip. It needs a connection."); });
    return () => { cancelled = true; };
  }, [staffId, period]);

  // Auto-close after a while, so a slip is not left open on a shared tablet.
  useEffect(() => {
    const t = setTimeout(onClose, 3 * 60_000);
    return () => clearTimeout(t);
  }, [onClose]);

  const text = slip ? buildTechSlipText(slip, timezone) : "";
  const canPrint = typeof window !== "undefined" && !!(window as any).CERTXA_PRINT_TEXT;
  const print = async () => {
    if (!slip || printing) return;
    if (!canPrint) { setNote("This tablet's app gets slip printing with its next update, which it installs on its own at its next restart."); return; }
    setPrinting(true); setNote(null);
    const r = await printOnTablet(text);
    setPrinting(false);
    setNote(r.ok ? "Printed." : r.error || "The printer did not respond.");
  };

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} style={{ zIndex: 520 }} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-labelledby="nail-slip-title" data-testid="nail-tech-slip" style={{ zIndex: 521, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="assign-create-header">
          <div><h2 id="nail-slip-title">My Slip</h2><p>{staffName}</p></div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "0 22px 10px" }}>
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} data-testid={`nail-slip-${p.key}`}
              className={`assign-create-item ${period === p.key ? "assign-create-item-sel" : ""}`} style={{ flex: 1, justifyContent: "center" }}>{p.label}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px" }}>
          {error ? <p className="assign-create-error">{error}</p>
            : !slip ? <p style={{ opacity: 0.7 }}>Loading…</p>
            : <pre data-testid="nail-slip-preview" style={{ margin: 0, padding: 14, background: "#fff", color: "#111", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 13, lineHeight: 1.35, whiteSpace: "pre", overflowX: "auto", borderRadius: 6 }}>
                {text.split("\n").map((l) => l.replace(/^\[[LC]\]/, "").replace(/<\/?b>/g, "")).join("\n")}
              </pre>}
        </div>
        {note && <p className="assign-create-hint" style={{ margin: "8px 22px 0" }}>{note}</p>}
        <div className="assign-create-footer">
          <button type="button" className="assign-create-skip" onClick={onClose}>Close</button>
          <button type="button" disabled={!slip || printing} onClick={() => void print()} data-testid="nail-slip-print"
            className={`assign-create-btn ${slip && !printing ? "assign-create-btn-ready" : ""}`}>{printing ? "PRINTING…" : "PRINT"}</button>
        </div>
      </div>
    </>
  );
}
