import { LogOut, X } from "lucide-react";
import type { TurnTech } from "./nailApi";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/**
 * Tapped a clocked-in tech's card: their card, big, with one big button to clock them out.
 * The mirror of TechClockInSheet — it takes them off the clock and out of the turn order.
 */
export function TechClockOutSheet({ tech, busy, onClockOut, onClose }: { tech: TurnTech; busy: boolean; onClockOut: () => void; onClose: () => void }) {
  const color = tech.color || "#454c56";
  const onBreak = !!tech.paused || tech.currentStatus === "on_break";
  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="tech-popup" role="dialog" aria-label={`Clock ${tech.name} out`} data-testid="nail-tech-out-popup">
        <button type="button" className="tech-popup-close" onClick={onClose} aria-label="Close"><X size={26} /></button>
        <div className="tech-popup-card" style={{ borderLeftColor: color }}>
          <span className="tech-popup-avatar" style={{ borderColor: color }}>
            {tech.avatarUrl ? <img src={tech.avatarUrl} alt="" /> : initials(tech.name)}
          </span>
          <div className="tech-popup-name">
            <strong>{tech.name}</strong>
            <span>{onBreak ? "On a break" : "Clocked in and free"}</span>
          </div>
          <span className="tech-pill" data-status={onBreak ? "break" : "available"}>{onBreak ? "ON BREAK" : "AVAILABLE"}</span>
        </div>
        <button type="button" className="tech-popup-go tech-popup-out" onClick={onClockOut} disabled={busy} data-testid="nail-tech-clock-out">
          <LogOut size={30} />
          CLOCK OUT
        </button>
        <p className="tech-popup-note">Takes {tech.name.split(" ")[0]} off the clock and out of the turn order.</p>
      </div>
    </>
  );
}
