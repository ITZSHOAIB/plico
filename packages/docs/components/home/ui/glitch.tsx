"use client";

import { useCallback } from "react";
import { reduced } from "../lib/beat";

function frame(top: number, bottom: number, shift: number, inverted = false): Keyframe {
  return {
    visibility: "visible",
    clipPath: `inset(${top}% 0 ${bottom}% 0)`,
    transform: `translateX(${shift}em)`,
    backgroundColor: inverted ? "var(--ph-accent)" : "var(--ph-paper)",
    color: inverted ? "var(--ph-paper)" : "var(--ph-accent)",
    easing: "step-end",
  };
}

/** Each slice's three frames: a band of the word, shifted sideways; the slices are pseudo-elements */
const KEYFRAMES = [
  [frame(14, 58, 0.07), frame(46, 38, -0.1, true), frame(70, 10, 0.08), { visibility: "hidden" }],
  [frame(62, 20, -0.05), frame(20, 70, 0.04), frame(0, 100, 0), { visibility: "hidden" }],
];

/**
 * Two offset slices of the word burst over it for 150ms, `delay` ms after mount. The slices are
 * drawn from `data-text`, so the word is in the page's text once.
 */
export function Glitch({ children, delay = 0 }: { children: string; delay?: number }) {
  const ref = useCallback(
    (root: HTMLSpanElement | null) => {
      if (!root || reduced()) return;
      const burst = () => {
        for (const [i, pseudoElement] of ["::before", "::after"].entries())
          root.animate(KEYFRAMES[i], { duration: 150, pseudoElement });
      };
      const timer = setTimeout(burst, delay);
      root.addEventListener("pointerenter", burst);
      return () => {
        clearTimeout(timer);
        root.removeEventListener("pointerenter", burst);
      };
    },
    [delay],
  );
  return (
    <span ref={ref} className="ph-glitch" data-text={children}>
      {children}
    </span>
  );
}
