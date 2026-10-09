import { useCallback, useEffect, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { useShake } from "@/hooks/use-shake";
import { ApiError, identifyBarber, type BarberSignIn } from "./barberApi";
import "./barberGate.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * The lock in front of the barber POS: whoever walks up types their Barber ID (1–2 digits) first, so
 * every assign and checkout is theirs. The screen comes back here after each one.
 */
export function BarberIdGate({ storeName, timezone, waiting, onSignedIn }: {
  storeName: string;
  /** The shop's timezone, so the clock reads shop time whatever the tablet is set to. */
  timezone: string;
  /** Clients still waiting for a barber, first in line first. Only the first five are shown. */
  waiting: { key: string; ticketNumber: number | null; name: string }[];
  onSignedIn: (who: BarberSignIn) => void;
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
      onSignedIn(await identifyBarber(Number(digits)));
    } catch (err) {
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
    <div className="bg-gate" data-testid="barber-id-gate">
      <header className="bg-gate-head">
        <div className="bg-gate-shop">
          <strong>{storeName}</strong>
        </div>
        <span className="bg-gate-clock" data-testid="barber-id-clock">{clock}</span>
      </header>

      <div className="bg-gate-body">
       <div className="bg-gate-row">
        <section className="bg-gate-card bg-gate-pad">
          <p className="bg-gate-label">Enter your Barber ID</p>
          <div className={`bg-gate-slots ${shakeClass}`} onAnimationEnd={onShakeEnd} data-testid="barber-id-display">
            {[0, 1].map((i) => (
              <span key={i} className="bg-gate-slot" data-filled={digits[i] != null}>
                {busy && i === 0 ? <Loader2 className="h-6 w-6 animate-spin" /> : busy ? "" : digits[i] ?? ""}
              </span>
            ))}
          </div>
          <p className="bg-gate-msg" role="alert" data-testid="barber-id-message">{message}</p>

          <div className="bg-gate-keys">
            {KEYS.map((d) => <button key={d} type="button" className="bg-gate-key" disabled={busy} onClick={() => press(d)} data-testid={`barber-id-key-${d}`}>{d}</button>)}
            <span aria-hidden />
            <button type="button" className="bg-gate-key" disabled={busy} onClick={() => press("0")} data-testid="barber-id-key-0">0</button>
            <button type="button" className="bg-gate-key ghost" disabled={busy || digits.length === 0} onClick={back} aria-label="Delete" data-testid="barber-id-key-back"><Delete className="h-7 w-7" /></button>
          </div>
          <button type="button" className="bg-gate-enter" disabled={busy || digits.length === 0} onClick={() => void enter()} data-testid="barber-id-enter">ENTER</button>
        </section>

        <section className="bg-gate-card bg-gate-wait" data-testid="barber-id-waiting">
          <p className="bg-gate-label">Waiting</p>
          {waiting.length === 0
            ? <p className="bg-gate-empty">No one waiting</p>
            : (
              <ol>
                {waiting.slice(0, 5).map((w) => (
                  <li key={w.key} data-testid="barber-id-waiting-row">
                    {w.ticketNumber != null && <span>#{w.ticketNumber}</span>}
                    <strong>{w.name}</strong>
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
