"use client";

import { reduced } from "../lib/beat";
import { onStatus, useActive, useFigures } from "../lib/status";
import { MotionToggle } from "./motion-toggle";

/**
 * The bar along the bottom of the homepage: a lit lamp and the page's latest event line, printed
 * in as the paper over it steps off to the right, then a link to each figure and the motion pause.
 * The line never re-renders React; it writes its one text node.
 */
export function StatusBar() {
  return (
    <div className="ph-statusbar">
      <div className="ph-statusbar-inner">
        <p aria-hidden className="ph-statusbar-line">
          <span className="ph-lamp" />
          <span ref={print} className="ph-statusbar-text">
            <b>00</b> <span>ready</span>
          </span>
        </p>
        <Figures />
        <MotionToggle />
      </div>
    </div>
  );
}

function print(el: HTMLSpanElement | null) {
  if (!el) return;
  const [n, text] = [el.firstElementChild, el.lastElementChild];
  return onStatus((line, seq) => {
    if (!n || !text) return;
    n.textContent = String(seq).padStart(2, "0");
    text.textContent = line;
    if (reduced()) return;
    el.animate(
      { translate: ["0", "100%"] },
      { duration: 300, easing: "steps(12)", pseudoElement: "::after" },
    );
  });
}

function Figures() {
  const figures = useFigures();
  const active = useActive();
  return (
    <nav aria-label="Sections" className="ph-statusbar-nav">
      {figures.map((f) => (
        <a key={f.id} href={`#${f.id}`} aria-current={active === f.id ? "location" : undefined}>
          {f.label}
        </a>
      ))}
    </nav>
  );
}
