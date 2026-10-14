import { useEffect, useState } from "react";
import { buildTechSlipText, type TechSlip } from "@/lib/techSlip";
import { ApiError, identifyTech, type TechSignIn } from "./nailApi";

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
 * A technician's own pay slip, opened from More → My Slip (signed in, or with their Tech ID): today (each ticket), this
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

/**
 * More → My Slip when no technician is signed in on this tablet: the technician types their own Tech ID,
 * which signs them in exactly like the lock screen does (a technician using the system is clocked in).
 * If signing in just handed them a waiting client, that is announced as usual instead of the slip.
 */
export function SlipTechIdSheet({ onSlip, onSignedIn, onClose }: {
  onSlip: (staff: { id: number; name: string }) => void;
  onSignedIn: (who: TechSignIn) => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const press = (d: string) => { setMessage(null); setDigits((cur) => (cur.length >= 2 ? cur : cur + d)); };
  const enter = async () => {
    if (busy || !digits) return;
    setBusy(true);
    try {
      const who = await identifyTech(Number(digits));
      if (who.justAssigned) onSignedIn(who); else onSlip({ id: who.staff.id, name: who.staff.name });
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 404 ? "No technician has that ID." : (err as any)?.message || "Could not check the ID. It needs a connection.");
      setDigits("");
    } finally { setBusy(false); }
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} style={{ zIndex: 520 }} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-label="My Slip" data-testid="nail-slip-id" style={{ zIndex: 521, maxWidth: 420 }}>
        <div className="assign-create-header">
          <h2>My Slip</h2>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p style={{ textAlign: "center", fontSize: 34, fontWeight: 700, letterSpacing: 8, minHeight: 44, margin: "8px 0" }} data-testid="nail-slip-id-digits">{digits || <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: 0, opacity: .5 }}>Enter your Tech ID</span>}</p>
        {message && <p className="assign-create-error" role="alert">{message}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {keys.map((k, i) => k === "" ? <span key={i} /> : (
            <button key={i} type="button" className="assign-create-item" disabled={busy} style={{ justifyContent: "center", fontSize: 24, height: 64 }}
              onClick={() => (k === "⌫" ? setDigits((cur) => cur.slice(0, -1)) : press(k))} data-testid={`nail-slip-id-key-${k === "⌫" ? "back" : k}`}>{k}</button>
          ))}
        </div>
        <button type="button" className="assign-create-item assign-create-item-sel" disabled={busy || !digits} onClick={() => void enter()}
          style={{ justifyContent: "center", width: "100%", height: 60, marginTop: 10, fontSize: 20, fontWeight: 700 }} data-testid="nail-slip-id-enter">{busy ? "…" : "ENTER"}</button>
      </div>
    </>
  );
}
