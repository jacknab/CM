import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const keys = Object.keys(durations);
  const [currentScene, setCurrentScene] = useState(0);
  const hasStoppedRef = useRef(false);
  const totalDuration = Object.values(durations).reduce((a, b) => a + b, 0);

  useEffect(() => {
    window.startRecording?.();

    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    keys.forEach((_, idx) => {
      const delay = elapsed;
      elapsed += durations[keys[idx]];

      if (idx === 0) return;

      timers.push(
        setTimeout(() => {
          setCurrentScene(idx);
        }, delay)
      );
    });

    const stopTimer = setTimeout(() => {
      if (!hasStoppedRef.current) {
        hasStoppedRef.current = true;
        window.stopRecording?.();
      }
    }, totalDuration);

    timers.push(stopTimer);

    const loopTimer = setTimeout(() => {
      setCurrentScene(0);
    }, totalDuration);

    timers.push(loopTimer);

    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (currentScene === 0 && hasStoppedRef.current) {
      const keys2 = Object.keys(durations);
      let elapsed = 0;
      const timers: ReturnType<typeof setTimeout>[] = [];

      keys2.forEach((_, idx) => {
        const delay = elapsed;
        elapsed += durations[keys2[idx]];

        if (idx === 0) return;

        timers.push(
          setTimeout(() => {
            setCurrentScene(idx);
          }, delay)
        );
      });

      const loopTimer = setTimeout(() => {
        setCurrentScene(0);
      }, totalDuration);

      timers.push(loopTimer);

      return () => timers.forEach(clearTimeout);
    }
    return undefined;
  }, [currentScene]);

  return { currentScene };
}
