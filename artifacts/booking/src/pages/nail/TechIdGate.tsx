import { useCallback, useEffect, useState } from "react";
import { useNailText } from "./i18n";
import { Delete, Loader2 } from "lucide-react";
import { TURN_UNIT, formatTurns } from "@shared/turnRules";
import { useShake } from "@/hooks/use-shake";
import { ApiError, identifyTech, type TechSignIn } from "./nailApi";
import { resumeOrSignIn } from "@/lib/resumeSignIn";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import "./techGate.css";
import { techLabel } from "./techName";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * The lock in front of the nail POS (a copy of the barber screen's BarberIdGate): whoever walks up
 * types their Tech ID (1–2 digits) first. The screen comes back here after each saved ticket or checkout.
 */
export function TechIdGate({ storeName, timezone, turnQueue, keypadVisible = true, onOpenTurnPage, onSignedIn }: {
  storeName: string;
  /** The shop's timezone, so the clock reads shop time whatever the tablet is set to. */
  timezone: string;
  /** Clocked-in technicians in turn order: the free ones first (numbered — 1 is next up), then those busy or on break. */
  turnQueue: { id: number; name: string; status: "available" | "busy" | "on_break"; position: number | null; /** Turns so far this period, in thousandths of a turn. */ turnUnits: number }[];
  /** False = scanner-only lock screen. */
  keypadVisible?: boolean;
  /** Opens the full Turn page (it used to open from the calendar's turn queue column). */
  onOpenTurnPage: () => void;
  onSignedIn: (who: TechSignIn) => void;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { t: tx } = useNailText();
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

  const signIn = useCallback(async (techId: number) => {
    if (busy || !Number.isInteger(techId)) return;
    setBusy(true);
    try {
      const who = await identifyTech(techId);
      onSignedIn(who);
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
  }, [busy, onSignedIn, shake]);

  const enter = useCallback(async () => {
    if (digits.length === 0) return;
    await signIn(Number(digits));
  }, [digits, signIn]);

  useBarcodeScanner((raw) => {
    const trimmed = raw.trim();
    const techMatch = /^TECH:(\d{1,2})$/i.exec(trimmed);
    if (techMatch) {
      setDigits(techMatch[1]);
      void signIn(Number(techMatch[1]));
      return;
    }
    const qrMatch = /^QR:(.+)$/i.exec(trimmed);
    if (qrMatch) {
      // QR confirmation code for sensitive settings (e.g. keypad hide)
      void handleQrConfirmation(qrMatch[1]);
      return;
    }
    setMessage("That is not a Tech ID badge."); shake();
  });

  const handleQrConfirmation = useCallback(async (token: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/nail/qr-code/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMessage("Keypad hide confirmed.");
        setDigits("");
      } else {
        setMessage(data.message || "QR code not valid.");
        shake();
      }
    } catch {
      setMessage("No connection. Try again.");
      shake();
    } finally {
      setBusy(false);
    }
  }, [busy, shake]);

  // A keyboard (or a numeric scanner wedge) works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!keypadVisible) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") void enter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter, keypadVisible]);

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
        <section className={`ng-gate-card ng-gate-pad ${!keypadVisible ? "ng-gate-scan" : ""}`}>
          <p className="ng-gate-label">{keypadVisible ? "Enter your Tech ID" : "SCAN YOUR ID"}</p>
          {!keypadVisible && <p className="ng-gate-scan-help">Hold your printed Tech ID under the scanner</p>}
          <div className={`ng-gate-slots ${shakeClass}`} onAnimationEnd={onShakeEnd} data-testid="tech-id-display">
            {[0, 1].map((i) => (
              <span key={i} className="ng-gate-slot" data-filled={digits[i] != null}>
                {busy && i === 0 ? <Loader2 className="h-6 w-6 animate-spin" /> : busy ? "" : digits[i] ?? ""}
              </span>
            ))}
          </div>
          <p className="ng-gate-msg" role="alert" data-testid="tech-id-message">{message}</p>

          {keypadVisible && (
            <>
              <div className="ng-gate-keys">
                {KEYS.map((d) => <button key={d} type="button" className="ng-gate-key" disabled={busy} onClick={() => press(d)} data-testid={`tech-id-key-${d}`}>{d}</button>)}
                <span aria-hidden />
                <button type="button" className="ng-gate-key" disabled={busy} onClick={() => press("0")} data-testid="tech-id-key-0">0</button>
                <button type="button" className="ng-gate-key ghost" disabled={busy || digits.length === 0} onClick={back} aria-label="Delete" data-testid="tech-id-key-back"><Delete className="h-7 w-7" /></button>
              </div>
              <button type="button" className="ng-gate-enter" disabled={busy || digits.length === 0} onClick={() => void enter()} data-testid="tech-id-enter">{tx("enter")}</button>
            </>
          )}
        </section>

        <section className="ng-gate-card ng-gate-wait" data-testid="tech-id-turn-queue">
          <button type="button" className="ng-gate-turn-btn" onClick={onOpenTurnPage} data-testid="tech-id-open-turn-page">{tx("turnQueue")}</button>
          {turnQueue.length === 0
            ? <p className="ng-gate-empty">{tx("noneClockedIn")}</p>
            : (
              <ol>
                {turnQueue.map((t) => (
                  <li key={t.id} data-status={t.status} data-testid="tech-id-turn-row">
                    <span>{t.position ?? "–"}</span>
                    <strong>{techLabel(t.name, t.id)}</strong>
                    {/* How many turns they have, halves included: "1/2 turn", "1 turn", "1 1/2 turns". */}
                    <em data-testid="tech-id-turn-count">{formatTurns(t.turnUnits)} {t.turnUnits > 0 && t.turnUnits <= TURN_UNIT ? tx("turn") : tx("turns")}</em>
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
