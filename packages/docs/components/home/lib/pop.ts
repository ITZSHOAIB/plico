/**
 * How things appear. A window pops the way an old desktop zooms one open: from a 6px ink dot
 * through a few scales, a keyframe a frame with no easing between. Text types in a few characters
 * a tick.
 */
import type { Wait } from "./beat";

export const FRAME = 42;

export const POP: Keyframe[] = [
  { transform: "scale(0)", opacity: 1 },
  { transform: "scale(0.3, 0.2)" },
  { transform: "scale(0.86)" },
  { transform: "none" },
];

export const POP_SLOW: Keyframe[] = [
  { transform: "scale(0)" },
  { transform: "scale(0.08, 0.07)" },
  { transform: "scale(0.27, 0.25)" },
  { transform: "scale(0.87)" },
  { transform: "scale(0.96)" },
  { transform: "none" },
];

/** `el` shown, popping from its transform origin, `delay` ms from now */
export function pop(el: Element, frames: Keyframe[] = POP, delay = 0): Animation {
  el.removeAttribute("data-hidden");
  return el.animate(frames, {
    duration: (frames.length - 1) * FRAME,
    delay,
    fill: "backwards",
    // one step a keyframe: the scale jumps from frame to frame, never slides
    easing: `steps(${frames.length}, jump-none)`,
  });
}

/** Hidden till it pops; cleared by `pop`. Server HTML never sets it. */
export function hide(el: Element) {
  el.setAttribute("data-hidden", "");
}

/** Types `text` into `el`'s text, `chars` a step, `ms` between steps */
export async function type(el: HTMLElement, text: string, wait: Wait, ms = 28, chars = 1) {
  for (let i = 0; i <= text.length; i += chars) {
    el.textContent = text.slice(0, i);
    await wait(ms);
  }
  el.textContent = text;
}
