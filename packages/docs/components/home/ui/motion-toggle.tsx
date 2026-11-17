"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isPaused, onPause, setPaused } from "../lib/beat";

/**
 * The status bar's pause: stops every looping section where it is and holds CSS animations, until
 * pressed again. The page carries `data-paused` while it is down.
 */
export function MotionToggle() {
  const paused = useSyncExternalStore(onPause, isPaused, () => false);
  const ref = useCallback(
    (button: HTMLButtonElement | null) => {
      button?.closest(".plico-home")?.toggleAttribute("data-paused", paused);
    },
    [paused],
  );
  return (
    <button
      ref={ref}
      type="button"
      className="ph-statusbar-pause"
      aria-pressed={paused}
      onClick={() => setPaused(!paused)}
    >
      pause motion
    </button>
  );
}
