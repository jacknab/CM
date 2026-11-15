/**
 * A bullet in front of a line of a kiosk text box (shared/kiosk/layout.ts KIOSK_BULLETS), drawn as SVG so it is
 * sharp at any size: it takes the text's size (1em) and the bullet's own colour.
 */
import type { KioskBulletDesign } from "@shared/kiosk/layout";

const SHAPES: Record<KioskBulletDesign, React.ReactNode> = {
  // A bold check mark, like a hand-drawn tick.
  check: <path d="M3.5 12.8l5.2 5.1L20.6 5.6" fill="none" stroke="currentColor" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />,
  dot: <circle cx="12" cy="12" r="5.5" fill="currentColor" />,
  star: <path d="M12 2.8l2.75 5.85 6.4.75-4.72 4.38 1.25 6.33L12 16.95l-5.68 3.16 1.25-6.33-4.72-4.38 6.4-.75z" fill="currentColor" />,
  heart: <path d="M12 20.6s-7.9-4.9-7.9-10.6A4.45 4.45 0 0 1 12 7.2a4.45 4.45 0 0 1 7.9 2.8c0 5.7-7.9 10.6-7.9 10.6z" fill="currentColor" />,
  diamond: <path d="M12 3.2l6.6 8.8L12 20.8 5.4 12z" fill="currentColor" />,
};

export function KioskBullet({ design, color, size = "1em" }: { design: KioskBulletDesign; color: string; size?: string | number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ color, flexShrink: 0, display: "block" }}>
      {SHAPES[design]}
    </svg>
  );
}
