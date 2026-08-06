import { useEffect, useRef, useState } from "react";

// Ease-out cubic — fast start, smooth deceleration
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface AnimatedNumberProps {
  /** The target numeric value */
  value: number;
  /** How to display the number */
  format?: "currency" | "percent" | "integer" | "decimal";
  /** Animation duration in ms (default 750) */
  duration?: number;
  className?: string;
  /** Text placed before the formatted number */
  prefix?: string;
  /** Text placed after the formatted number */
  suffix?: string;
}

function formatValue(n: number, fmt: AnimatedNumberProps["format"]): string {
  switch (fmt) {
    case "currency":
      return "$" + Math.round(n).toLocaleString("en-US");
    case "percent":
      return Math.round(n) + "%";
    case "decimal":
      return n.toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    default:
      return Math.round(n).toLocaleString("en-US");
  }
}

/**
 * Renders a number that smoothly counts from its previous value to the next
 * whenever `value` changes. Uses requestAnimationFrame — no external deps.
 */
export function AnimatedNumber({
  value,
  format = "integer",
  duration = 750,
  className,
  prefix,
  suffix,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;

    if (from === to) return;

    // Cancel any running animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    fromRef.current = from;
    startRef.current = null;

    const tick = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = from + (to - from) * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {formatValue(display, format)}
      {suffix}
    </span>
  );
}
