import { Clock, X } from "lucide-react";
import type { TurnTech } from "./nailApi";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/**
 * Tapped a clocked-out tech's card: their card, big, with one big button to put them In and Available.
 * Setting them in puts them at the end of the turn order (the same clock-in the time clock does).
 */
export function TechClockInSheet({ tech, busy, onSetIn, onClose }: { tech: TurnTech; busy: boolean; onSetIn: () => void; onClose: () => void }) {
  const color = tech.color || "#454c56";
  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="tech-popup" role="dialog" aria-label={`Set ${tech.name} in`} data-testid="nail-tech-popup">
        <button type="button" className="tech-popup-close" onClick={onClose} aria-label="Close"><X size={26} /></button>
        <div className="tech-popup-card" style={{ borderLeftColor: color }}>
          <span className="tech-popup-avatar" style={{ borderColor: color }}>
            {tech.avatarUrl ? <img src={tech.avatarUrl} alt="" /> : initials(tech.name)}
          </span>
          <div className="tech-popup-name">
            <strong>{tech.name}</strong>
            <span>Not in the turn order</span>
          </div>
          <span className="tech-pill" data-status="off">NOT CLOCKED IN</span>
        </div>
        <button type="button" className="tech-popup-go" onClick={onSetIn} disabled={busy} data-testid="nail-tech-set-in">
          <Clock size={30} />
          SET IN / AVAILABLE
        </button>
        <p className="tech-popup-note">Puts {tech.name.split(" ")[0]} on the clock and at the end of the turn order.</p>
      </div>
    </>
  );
}
