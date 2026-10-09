import { useCallback, useEffect, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { useShake } from "@/hooks/use-shake";
import { ApiError, identifyTech, type TechSignIn } from "./nailApi";
import { resumeOrSignIn } from "@/lib/resumeSignIn";
import "./techGate.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * The lock in front of the nail POS (a copy of the barber screen's BarberIdGate): whoever walks up
 * types their Tech ID (1–2 digits) first. The screen comes back here after each saved ticket or checkout.
 */
export function TechIdGate({ storeName, timezone, turnQueue, onOpenTurnPage, onSignedIn }: {
  storeName: string;
  /** The shop's timezone, so the clock reads shop time whatever the tablet is set to. */
  timezone: string;
  /** Clocked-in technicians in turn order: the free ones first (numbered — 1 is next up), then those busy or on break. */
  turnQueue: { id: number; name: string; status: "available" | "busy" | "on_break"; position: number | null }[];
  /** Opens the full Turn page (it used to open from the calendar's turn queue column). */
  onOpenTurnPage: () => void;
  onSignedIn: (who: TechSignIn) => void;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { shakeClass, shake, onShakeEnd } = useShake();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(iv);
  }, []);
  let clock: string;
  try { clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: timezone }); }
  catch { clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

  const press = (d: string) => { setMessage(""); setDigits((cur) => (cur.length >= 2 ? cur : cur + d)); };
  const back = () => { setMessage(""); setDigits((cur) => cur.slice(0, -1)); };

  const enter = useCallback(async () => {
    if (busy || digits.length === 0) return;
    setBusy(true);
    try {
      onSignedIn(await identifyTech(Number(digits)));
    } catch (err) {
      // 401 = this device is no longer signed in to the salon's account (signed out in another tab, or the
      // login expired). No Tech ID can work until someone signs in again, so say that and go to the sign-in page.
      if (err instanceof ApiError && err.status === 401) {
        setMessage("This device was signed out. Signing it back in…");
        setDigits("");
        void resumeOrSignIn("/nail");
        return;
      }
      setMessage(err instanceof ApiError ? err.message : "Couldn't check that ID. Try again.");
      setDigits("");
      shake();
    } finally {
      setBusy(false);
    }
  }, [busy, digits, onSignedIn, shake]);

  // A keyboard (or a numeric scanner wedge) works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") void enter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter]);

  return (
    <div className="ng-gate" data-testid="tech-id-gate">
      <header className="ng-gate-head">
        <div className="ng-gate-shop">
          <strong>{storeName}</strong>
        </div>
        <span className="ng-gate-clock" data-testid="tech-id-clock">{clock}</span>
      </header>

      <div className="ng-gate-body">
       <div className="ng-gate-row">
        <section className="ng-gate-card ng-gate-pad">
          <p className="ng-gate-label">Enter your Tech ID</p>
          <div className={`ng-gate-slots ${shakeClass}`} onAnimationEnd={onShakeEnd} data-testid="tech-id-display">
            {[0, 1].map((i) => (
              <span key={i} className="ng-gate-slot" data-filled={digits[i] != null}>
                {busy && i === 0 ? <Loader2 className="h-6 w-6 animate-spin" /> : busy ? "" : digits[i] ?? ""}
              </span>
            ))}
          </div>
          <p className="ng-gate-msg" role="alert" data-testid="tech-id-message">{message}</p>

          <div className="ng-gate-keys">
            {KEYS.map((d) => <button key={d} type="button" className="ng-gate-key" disabled={busy} onClick={() => press(d)} data-testid={`tech-id-key-${d}`}>{d}</button>)}
            <span aria-hidden />
            <button type="button" className="ng-gate-key" disabled={busy} onClick={() => press("0")} data-testid="tech-id-key-0">0</button>
            <button type="button" className="ng-gate-key ghost" disabled={busy || digits.length === 0} onClick={back} aria-label="Delete" data-testid="tech-id-key-back"><Delete className="h-7 w-7" /></button>
          </div>
          <button type="button" className="ng-gate-enter" disabled={busy || digits.length === 0} onClick={() => void enter()} data-testid="tech-id-enter">ENTER</button>
        </section>

        <section className="ng-gate-card ng-gate-wait" data-testid="tech-id-turn-queue">
          <button type="button" className="ng-gate-turn-btn" onClick={onOpenTurnPage} data-testid="tech-id-open-turn-page">Turn Queue</button>
          {turnQueue.length === 0
            ? <p className="ng-gate-empty">No technicians clocked in</p>
            : (
              <ol>
                {turnQueue.map((t) => (
                  <li key={t.id} data-status={t.status} data-testid="tech-id-turn-row">
                    <span>{t.position ?? "–"}</span>
                    <strong>{t.name}</strong>
                    <em>{t.status === "available" ? "Available" : t.status === "busy" ? "Busy" : "On break"}</em>
                  </li>
                ))}
              </ol>
            )}
        </section>
       </div>
      </div>
    </div>
  );
}
