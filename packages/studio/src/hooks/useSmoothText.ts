import { useEffect, useRef, useState } from "react";

/** How long the reveal takes to catch up with text that has already arrived. */
const catchUpMs = 160;
/** Finish a word rather than cutting it, unless the word is very long. */
const maxWordLookahead = 12;

function motionAllowed(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function nextBoundary(text: string, from: number): number {
  const space = text.slice(from, from + maxWordLookahead).search(/\s/);
  return space === -1 ? from : from + space;
}

/**
 * Reveals streamed text at a steady pace, so bursty model deltas read as smooth typing.
 * Shows the full text at once when the stream ends or the user prefers reduced motion.
 */
export function useSmoothText(target: string, streaming: boolean): string {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const show = (text: string) => {
      shownRef.current = text;
      setShown(text);
    };
    if (!streaming || !motionAllowed()) {
      show(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A retried model attempt replaces the text; start that attempt's reveal from scratch.
      const base = target.startsWith(shownRef.current) ? shownRef.current.length : 0;
      const remaining = target.length - base;
      if (remaining <= 0) return;
      const elapsed = Math.min(64, now - last);
      last = now;
      const step = Math.max(1, Math.ceil((remaining * elapsed) / catchUpMs));
      show(target.slice(0, nextBoundary(target, base + step)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, streaming]);

  return shown;
}
