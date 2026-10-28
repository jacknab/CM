import { useEffect } from "react";
import type { TurnEarned } from "./nailApi";
import { techLabel } from "./techName";

const RING = 2 * Math.PI * 54;

/** A completed paid ticket with service revenue must never display as zero turns. */
type TurnSummary = Pick<TurnEarned, "mode" | "earned" | "serviceAmount">;
function earnedTurns(t: TurnSummary): number {
  if (Number.isFinite(t.earned) && t.earned > 0) return t.earned;
  if (t.serviceAmount > 0) return 0.5;
  return 0;
}

/** "1/2" for a half, "1", "2"… — the number drawn inside the ring. */
function turnFigure(earned: number): string {
  if (earned === 0.5) return "1/2";
  if (earned === 0.25) return "¼";
  if (earned === 0.75) return "¾";
  return String(Math.round(earned * 100) / 100);
}

export function turnTitle(t: TurnSummary): string {
  const earned = earnedTurns(t);
  if (earned <= 0) return "SHORT TURN";
  if (earned === 0.5) return "HALF TURN";
  if (earned < 1) return "PARTIAL TURN";
  if (earned === 1) return "FULL TURN";
  return `${turnFigure(earned)} TURNS`;
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
            const earned = earnedTurns(t);
            const filled = Math.min(1, Math.max(0, earned));
            return (
              <div key={t.appointmentId} className="nl-turn-item" data-testid={`nail-turn-${t.appointmentId}`} data-earned={earned}>
                {t.staffName && <p className="nl-turn-eyebrow">{techLabel(t.staffName)}</p>}
                <div className="nl-turn-ring">
                  <svg viewBox="0 0 120 120" aria-hidden>
                    <circle className="nl-turn-track" cx="60" cy="60" r="54" />
                    <circle className="nl-turn-fill" cx="60" cy="60" r="54" strokeDasharray={RING}
                      style={{ ["--nl-turn-from" as string]: RING, ["--nl-turn-to" as string]: RING * (1 - filled) }} />
                  </svg>
                  <span className="nl-turn-figure">{earned > 0 ? turnFigure(earned) : "0"}</span>
                </div>
                <strong className="nl-turn-title">{turnTitle(t)}</strong>
                <p className="nl-turn-sub">
                  {t.ticketNumber != null ? `Ticket #${t.ticketNumber} · ` : ""}${t.serviceAmount.toFixed(2)} in services
                </p>
                {earned <= 0 && <p className="nl-turn-note">You keep your place at the front of the line.</p>}
              </div>
            );
          })}
        </div>
        <span className="nl-turn-timer" style={{ animationDuration: `${seconds}s` }} aria-hidden />
      </div>
    </div>
  );
}
