import { useEffect } from "react";
import type { TurnEarned } from "./nailApi";

const RING = 2 * Math.PI * 54;

/** ½ for a half, "1", "2"… — the number drawn inside the ring. */
function turnFigure(earned: number): string {
  if (earned === 0.5) return "½";
  if (earned === 0.25) return "¼";
  if (earned === 0.75) return "¾";
  return String(Math.round(earned * 100) / 100);
}

export function turnTitle(t: Pick<TurnEarned, "mode" | "earned">): string {
  if (t.earned <= 0) return "SHORT TURN";
  if (t.earned === 0.5) return "HALF TURN";
  if (t.earned < 1) return "PARTIAL TURN";
  if (t.earned === 1) return "FULL TURN";
  return `${turnFigure(t.earned)} TURNS`;
}

/**
 * Shown right after a walk-in ticket is closed (paid, receipt handled): what that ticket was worth in
 * the turn rotation. The ring fills to the share of a turn it earned. Closes on its own, or on a tap.
 */
export function TurnEarnedPopup({ turns, onDone, seconds = 5 }: { turns: TurnEarned[]; onDone: () => void; seconds?: number }) {
  useEffect(() => {
    const timer = setTimeout(onDone, seconds * 1000);
    return () => clearTimeout(timer);
  }, [onDone, seconds]);

  return (
    <div className="nl-turn" role="status" aria-live="polite" onClick={onDone} data-testid="nail-turn-popup">
      <div className="nl-turn-card">
        <div className="nl-turn-row">
          {turns.map((t) => {
            const filled = Math.min(1, Math.max(0, t.earned));
            return (
              <div key={t.appointmentId} className="nl-turn-item" data-testid={`nail-turn-${t.appointmentId}`} data-earned={t.earned}>
                {t.staffName && <p className="nl-turn-eyebrow">{t.staffName}</p>}
                <div className="nl-turn-ring">
                  <svg viewBox="0 0 120 120" aria-hidden>
                    <circle className="nl-turn-track" cx="60" cy="60" r="54" />
                    <circle className="nl-turn-fill" cx="60" cy="60" r="54" strokeDasharray={RING}
                      style={{ ["--nl-turn-from" as string]: RING, ["--nl-turn-to" as string]: RING * (1 - filled) }} />
                  </svg>
                  <span className="nl-turn-figure">{t.earned > 0 ? turnFigure(t.earned) : "0"}</span>
                </div>
                <strong className="nl-turn-title">{turnTitle(t)}</strong>
                <p className="nl-turn-sub">
                  {t.ticketNumber != null ? `Ticket #${t.ticketNumber} · ` : ""}${t.serviceAmount.toFixed(2)} in services
                </p>
                {t.earned <= 0 && <p className="nl-turn-note">You keep your place at the front of the line.</p>}
              </div>
            );
          })}
        </div>
        <span className="nl-turn-timer" style={{ animationDuration: `${seconds}s` }} aria-hidden />
      </div>
    </div>
  );
}
