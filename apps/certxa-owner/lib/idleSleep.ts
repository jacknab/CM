/**
 * idleSleep.ts — Battery-saving "soft sleep" for POS tablets.
 *
 * These tablets are kept from truly sleeping (activateKeepAwakeAsync, called by the caller)
 * so the register never needs a PIN unlock mid-shift, and most tablets have no reliable
 * hardware tap-to-wake anyway. Instead, after IDLE_MS with no activity, the screen dims to
 * near-black and a full-screen overlay covers the app; any tap restores brightness and
 * dismisses it. Activity comes from two places: native touches (the root View, for taps
 * outside the WebView) and a CERTXA_ACTIVITY bridge message posted by injected JS on
 * touchstart/pointerdown inside the WebView content (see BRIDGE_JS in app/index.tsx) —
 * native View touch handlers do not reliably see touches that begin inside a WebView.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const IDLE_SLEEP_MS = 2 * 60 * 1000;

export function useIdleSleep(idleMs: number = IDLE_SLEEP_MS) {
  const [asleep, setAsleep] = useState(false);
  const asleepRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      asleepRef.current = true;
      setAsleep(true);
    }, idleMs);
  }, [idleMs]);

  const recordActivity = useCallback(() => {
    // Waking up happens explicitly via wake() (it also restores brightness) — a stray
    // activity ping arriving while already asleep should not clear the black overlay itself.
    if (!asleepRef.current) arm();
  }, [arm]);

  const wake = useCallback(() => {
    asleepRef.current = false;
    setAsleep(false);
    arm();
  }, [arm]);

  useEffect(() => {
    arm();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [arm]);

  return { asleep, recordActivity, wake };
}
