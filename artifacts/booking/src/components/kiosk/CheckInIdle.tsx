import type { ReactNode } from "react";

/**
 * The first screen of the check-in kiosk and the front desk tablet (owner, 2026-10-29). A client already knows which
 * salon they're in, so this screen says what to do — CHECK IN HERE, and the three steps — in type big enough to read
 * from the door, with slow movement (a breathing frame, a ripple round the button, a drifting glow) so the tablet
 * gets noticed when someone walks in. The whole screen starts the check-in.
 */
export interface CheckInIdleColors {
  BG: string; SURFACE: string; TEXT: string; MUTED: string; PRIMARY: string; ACCENT: string; BORDER: string; SHADOW_LG: string;
}

const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export function CheckInIdle({ c, text, onStart, extra, footer }: {
  c: CheckInIdleColors;
  text: { checkInHere: string; tapToStart: string; idleSteps: [string, string, string] };
  onStart: () => void;
  /** Shown under the steps (e.g. the loyalty promo). */
  extra?: ReactNode;
  /** Pinned to the bottom (e.g. the language choice); taps on it don't start the check-in. */
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden select-none"
      onPointerDown={onStart} onContextMenu={(e) => e.preventDefault()} data-testid="checkin-idle"
      style={{ background: c.BG, WebkitUserSelect: "none" }}>
      <style>{`
        @keyframes cxi-drift { 0% { transform: translate(-30%, -20%) } 50% { transform: translate(30%, 15%) } 100% { transform: translate(-30%, -20%) } }
        @keyframes cxi-frame { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes cxi-ripple { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.55); opacity: 0 } }
        @keyframes cxi-nudge { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @media (orientation: portrait) { .cxi-steps { flex-direction: column; align-items: stretch } .cxi-steps > li { max-width: none } }
      `}</style>

      {/* A soft glow drifting across the screen: movement the eye catches from across the room. */}
      <div aria-hidden className="absolute pointer-events-none" style={{
        width: "90vmax", height: "90vmax", borderRadius: "50%",
        background: `radial-gradient(circle, ${mix(c.PRIMARY, 22)} 0%, transparent 62%)`,
        animation: "cxi-drift 14s ease-in-out infinite",
      }} />
      {/* A frame round the screen that slowly breathes. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        boxShadow: `inset 0 0 0 clamp(8px, 1.2vmin, 14px) ${c.PRIMARY}, inset 0 0 80px ${mix(c.PRIMARY, 45)}`,
        animation: "cxi-frame 3.2s ease-in-out infinite",
      }} />

      <div className="relative z-10 flex flex-col items-center text-center px-8" style={{ gap: "clamp(20px, 4.5vh, 48px)" }}>
        <h1 style={{
          margin: 0, color: c.TEXT, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.02em",
          fontSize: "clamp(56px, min(12vw, 17vh), 170px)", textTransform: "uppercase",
        }}>
          {text.checkInHere}
        </h1>

        <div className="relative" style={{ animation: "cxi-nudge 2.4s ease-in-out infinite" }}>
          <span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `4px solid ${c.PRIMARY}`, animation: "cxi-ripple 2s ease-out infinite" }} />
          <span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `4px solid ${c.PRIMARY}`, animation: "cxi-ripple 2s ease-out 1s infinite" }} />
          <div className="relative rounded-full text-white" style={{
            background: `linear-gradient(135deg, ${c.PRIMARY}, ${c.ACCENT})`, boxShadow: c.SHADOW_LG,
            padding: "clamp(16px, 2.6vh, 26px) clamp(40px, 6vw, 80px)",
            fontSize: "clamp(24px, min(3.4vw, 5vh), 44px)", fontWeight: 800, letterSpacing: ".06em",
          }}>
            {text.tapToStart}
          </div>
        </div>

        <ol className="cxi-steps flex flex-wrap justify-center list-none p-0 m-0" style={{ gap: "clamp(12px, 2vw, 28px)" }}>
          {text.idleSteps.map((step, i) => (
            <li key={i} className="flex items-center rounded-2xl" style={{
              gap: 14, background: c.SURFACE, border: `1.5px solid ${c.BORDER}`,
              padding: "clamp(12px, 2vh, 20px) clamp(16px, 2vw, 26px)", maxWidth: 340, textAlign: "left",
            }}>
              <span className="flex items-center justify-center rounded-full shrink-0" style={{
                width: "clamp(38px, 5vh, 52px)", height: "clamp(38px, 5vh, 52px)", border: `2.5px solid ${c.PRIMARY}`,
                color: c.PRIMARY, fontWeight: 900, fontSize: "clamp(18px, 2.6vh, 26px)",
              }}>{i + 1}</span>
              <span style={{ color: c.TEXT, fontWeight: 600, fontSize: "clamp(18px, 3vmin, 28px)", lineHeight: 1.2 }}>{step}</span>
            </li>
          ))}
        </ol>

        {extra}
      </div>

      {footer && (
        <div className="absolute left-0 right-0 z-20 flex justify-center" style={{ bottom: "clamp(18px, 3vh, 30px)" }}
          onPointerDown={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
    </div>
  );
}
