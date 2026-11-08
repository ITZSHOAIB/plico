import { useEffect, useState } from "react";

// A glyph that grows and shrinks, like a terminal spinner. Plays forward then back.
const frames = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const frameMs = 110;

function motionAllowed(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Decorative activity indicator. Pair it with text that says what is happening. */
export function Spinner({ className = "" }: { className?: string }) {
  const [frame, setFrame] = useState(4);
  useEffect(() => {
    if (!motionAllowed()) return;
    const timer = setInterval(() => setFrame((current) => (current + 1) % frames.length), frameMs);
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      aria-hidden="true"
      className={`inline-grid w-[1.1em] place-items-center leading-none select-none ${className}`}
    >
      {frames[frame]}
    </span>
  );
}
