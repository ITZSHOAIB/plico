import { reduced } from "../../lib/beat";

/** "plico" in a 6 by 9 pixel face: ascender, x-height and descender rows */
const FACE: Record<string, string[]> = {
  p: ["", "", "####", "#   #", "#   #", "#   #", "####", "#", "#"],
  l: [" ##", "  #", "  #", "  #", "  #", "  #", " ###", "", ""],
  i: ["  #", "", " ##", "  #", "  #", "  #", " ###", "", ""],
  c: ["", "", " ###", "#   #", "#", "#   #", " ###", "", ""],
  o: ["", "", " ###", "#   #", "#   #", "#   #", " ###", "", ""],
};
/** each face pixel becomes this many characters across and lines down, near square in mono */
const SX = 5;
const SY = 3;
const INK = "@";
const SHADE = ":";
const NOISE = "!<>-_\\/[]{}=+*^?#%&$";

/**
 * The wordmark as lines of text: each pixel of the face filled with `@`, a `:` shadow cast down
 * and to the right. Pure, so the server renders the same art the client animates.
 */
export function wordmark(word: string): string[] {
  const cols = word.length * 6 * SX + 2;
  const rows = 9 * SY + 1;
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(" "));
  const put = (r: number, c: number, ch: string) => {
    for (let y = 0; y < SY; y++)
      for (let x = 0; x < SX; x++) {
        const cell = grid[r * SY + y + (ch === SHADE ? 1 : 0)];
        const at = c * SX + x + (ch === SHADE ? 2 : 0);
        if (ch === INK || cell[at] === " ") cell[at] = ch;
      }
  };
  for (const ch of [SHADE, INK])
    [...word].forEach((letter, n) => {
      FACE[letter]?.forEach((line, r) => {
        [...line].forEach((px, c) => {
          if (px === "#") put(r, n * 6 + c, ch);
        });
      });
    });
  return grid.map((line) => line.join(""));
}

const BAND = 10;
const SWEEP = 1300;
const REACH = 46;

/**
 * Brings the wordmark to life in two stacked `<pre>`s: `base` holds the art in ink, `live` the
 * accent glyphs over it. When it comes on screen a decoding front sweeps left to right, scrambled
 * glyphs just behind it; afterwards the pointer scrambles whatever it passes over. With reduced
 * motion the art stays still.
 */
export function createAscii(base: HTMLElement, live: HTMLElement, art: string[]): () => void {
  if (reduced()) return () => {};
  const rows = art.length;
  const cols = art[0].length;
  let front = Number.POSITIVE_INFINITY;
  let near: (r: number, c: number) => boolean = () => false;
  let frame = 0;

  const noise = () => NOISE[(Math.random() * NOISE.length) | 0];
  const draw = () => {
    let a = "";
    let b = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = art[r][c];
        const hidden = c >= front;
        const loud = ch !== " " && ((c < front && c >= front - BAND) || near(r, c));
        a += hidden || loud ? " " : ch;
        b += loud ? noise() : " ";
      }
      a += "\n";
      b += "\n";
    }
    base.textContent = a;
    live.textContent = b;
  };

  const sweep = (start: number) => (now: number) => {
    front = ((now - start) / SWEEP) * (cols + BAND);
    if (front >= cols + BAND) front = Number.POSITIVE_INFINITY;
    draw();
    frame = Number.isFinite(front) ? requestAnimationFrame(sweep(start)) : 0;
  };

  const seen = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      seen.disconnect();
      front = 0;
      frame = requestAnimationFrame((now) => sweep(now)(now));
    },
    { threshold: 0.5 },
  );
  seen.observe(base);

  const box = base.parentElement as HTMLElement;
  const move = (e: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    const w = rect.width / cols;
    const h = rect.height / rows;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    near = (r, c) => Math.hypot((c + 0.5) * w - x, (r + 0.5) * h - y) < REACH;
    if (!frame) draw();
  };
  const leave = () => {
    near = () => false;
    if (!frame) draw();
  };
  box.addEventListener("pointermove", move);
  box.addEventListener("pointerleave", leave);

  return () => {
    seen.disconnect();
    cancelAnimationFrame(frame);
    box.removeEventListener("pointermove", move);
    box.removeEventListener("pointerleave", leave);
  };
}
