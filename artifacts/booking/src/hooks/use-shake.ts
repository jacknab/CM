import { useCallback, useState, type AnimationEvent } from "react";

/**
 * A quick side-to-side shake for "that input isn't allowed" feedback (e.g. a phone digit that can't start a real US number).
 * Put `shakeClass` on the element that should shake and `onShakeEnd` on the same element; call `shake()` to trigger it.
 * Two identical keyframes (`cx-shake-a` / `cx-shake-b` in index.css) alternate, so every rejected key press restarts the shake
 * even while the last one is still running.
 */
export function useShake() {
  const [phase, setPhase] = useState<"a" | "b" | null>(null);
  const shake = useCallback(() => setPhase((p) => (p === "a" ? "b" : "a")), []);
  // Only this element's own animation ends it (an animation on a child bubbles up and must not cut the shake short).
  const onShakeEnd = useCallback((e: AnimationEvent<HTMLElement>) => { if (e.target === e.currentTarget) setPhase(null); }, []);
  return { shakeClass: phase ? `cx-shake-${phase}` : "", shake, onShakeEnd };
}
