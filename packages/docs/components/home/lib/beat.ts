/**
 * The homepage's clock. Motion snaps to a 120 bpm grid: a beat is 500ms, a tick a sixteenth of a
 * bar (125ms). Everything that moves eases out on one long exponential settle.
 */
export const BEAT = 500;
export const TICK = BEAT / 4;
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export function reduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The reader's pause, from the status bar. Paused, every looping script stops where it is and
 * CSS animations hold their frame; it is remembered across visits.
 */
const PAUSE_KEY = "plico-home-paused";
let paused = (() => {
  try {
    return typeof window !== "undefined" && localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
})();
const pauseListeners = new Set<() => void>();

export function isPaused(): boolean {
  return paused;
}

export function setPaused(next: boolean) {
  paused = next;
  try {
    localStorage.setItem(PAUSE_KEY, next ? "1" : "0");
  } catch {}
  for (const listener of pauseListeners) listener();
}

export function onPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function easeOut(t: number): number {
  return 1 - (1 - clamp(t)) ** 4;
}

/** Thrown out of `wait` when the script it belongs to is stopped. */
class Stopped extends Error {}

export type Wait = (ms: number) => Promise<void>;

/**
 * Runs `script` over and over while `el` is on screen, from the top each time it comes back into
 * view. `script` resets its own state first; `wait` throws once it is stopped, so a script never
 * outlives its section. Returns the stop. With reduced motion nothing runs and the server-rendered
 * final state stays. A pause stops the script where it is; playing again starts it from the top.
 */
export function play(
  el: Element,
  script: (wait: Wait) => Promise<void>,
  { threshold = 0.25, once = false } = {},
): () => void {
  if (reduced()) return () => {};
  let run = 0;
  let finished = false;
  const start = async () => {
    const id = ++run;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait: Wait = (ms) =>
      new Promise((resolve, reject) => {
        if (id !== run) return reject(new Stopped());
        const t = setTimeout(() => {
          timers.delete(t);
          id === run ? resolve() : reject(new Stopped());
        }, ms);
        timers.add(t);
      });
    try {
      do await script(wait);
      while (!once && id === run);
      finished = id === run;
    } catch (error) {
      if (!(error instanceof Stopped)) throw error;
    }
  };
  let started = false;
  let visible = false;
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (entry.isIntersecting) {
        if ((once && started) || paused) return;
        started = true;
        void start();
      } else if (!once) run++;
    },
    { threshold },
  );
  io.observe(el);
  const offPause = onPause(() => {
    if (paused) run++;
    else if (visible && !finished) {
      started = true;
      void start();
    }
  });
  return () => {
    run++;
    io.disconnect();
    offPause();
  };
}
