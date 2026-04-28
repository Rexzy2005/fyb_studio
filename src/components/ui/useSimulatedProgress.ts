import { useEffect, useRef, useState } from "react";

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function useSimulatedProgress(active: boolean, opts?: { start?: number; cap?: number }) {
  const start = clamp01((opts?.start ?? 0.06));
  const cap = clamp01((opts?.cap ?? 0.92));

  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    function clear() {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    if (!active) {
      clear();
      // When a job finishes, briefly snap to 100% so the UI feels complete.
      const finishTick = window.setTimeout(() => setProgress((p) => (p > 0 ? 1 : 0)), 0);
      const resetTick = window.setTimeout(() => setProgress(0), 250);
      return () => {
        window.clearTimeout(finishTick);
        window.clearTimeout(resetTick);
      };
    }

    const startTick = window.setTimeout(() => setProgress((p) => (p > 0 ? p : start)), 0);

    clear();
    intervalRef.current = window.setInterval(() => {
      setProgress((p) => {
        // Ease toward cap with a little randomness to feel "alive".
        const remaining = cap - p;
        if (remaining <= 0.002) return cap;
        const bump = Math.min(remaining, 0.01 + remaining * (0.10 + Math.random() * 0.12));
        return clamp01(p + bump);
      });
    }, 160);

    return () => {
      window.clearTimeout(startTick);
      clear();
    };
  }, [active, cap, start]);

  return progress;
}
