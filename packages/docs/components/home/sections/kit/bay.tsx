"use client";

import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { reduced } from "../../lib/beat";

/**
 * A machine's steps: 0 to `count - 1`, one every `ms`. It runs once when its bay comes into view
 * and again whenever the pointer enters its cell, so the bank never loops six at once. The
 * server renders the last step, and so does reduced motion.
 */
export function useStep(count: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(count - 1);
  useEffect(() => {
    const el = ref.current;
    const cell = el?.closest(".ph-kit-cell");
    if (!el || !cell || reduced()) return;
    let run = 0;
    const go = async () => {
      const id = ++run;
      for (let s = 0; s < count && id === run; s++) {
        setStep(s);
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
    };
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        seen.disconnect();
        void go();
      },
      { threshold: 0.6 },
    );
    seen.observe(el);
    cell.addEventListener("pointerenter", go);
    return () => {
      run++;
      seen.disconnect();
      cell.removeEventListener("pointerenter", go);
    };
  }, [count, ms]);
  return [ref, step] as const;
}

/** The bay a machine runs in: a square in each corner, the drawing on a 240 by 140 sheet */
export function Bay({ ref, children }: { ref: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={ref} aria-hidden className="ph-bay">
      <span className="ph-bay-corner" />
      <span className="ph-bay-corner" />
      <span className="ph-bay-corner" />
      <span className="ph-bay-corner" />
      <svg aria-hidden="true" viewBox="0 0 240 140" className="ph-bay-stage">
        {children}
      </svg>
    </div>
  );
}

/** `on` as a data attribute: present or absent */
export const flag = (on: boolean) => (on ? "" : undefined);

/** A translate for a group's style, so CSS can ease it */
export const at = (x: number, y = 0) => ({ transform: `translate(${x}px, ${y}px)` });
