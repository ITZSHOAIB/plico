/**
 * The event log drawn as five-channel teleprinter tape. The runtime's punch writes an event a
 * block at a time, the tape steps right past the read gate, and a bus carries what the gate read
 * down to each view. Columns encode the event's own text, a character a column. At rest every
 * event has passed the gate and the whole run lies on the strip.
 */
import { clamp, easeOut } from "../../lib/beat";

const COL = 8;
const TAPE = { top: 26, h: 72 };
const BUS = 26;
const ROWS = [0.36, 0.48, 0.74, 0.86];
const SPROCKET = 0.61;

export interface Block {
  label: string;
  short: string;
}

interface Tween {
  t0: number;
  ms: number;
}

export interface Tape {
  /** clears the tape for a fresh run */
  reset(): void;
  /** punches block `k` at the writer over `ms` */
  punch(k: number, ms: number): void;
  /** steps the tape one block right over `ms` */
  advance(ms: number): void;
  /** lights the gate and sends a packet down every drop over `ms` */
  read(ms: number): void;
  /** the finished run, drawn once */
  rest(): void;
  running(on: boolean): void;
  destroy(): void;
}

export function createTape(canvas: HTMLCanvasElement, drops: () => HTMLElement[], blocks: Block[]) {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  let w = 0;
  let h = 0;
  let from = blocks.length;
  let to = blocks.length;
  let step: Tween = { t0: 0, ms: 1 };
  let punched = blocks.length;
  let punching: Tween | null = null;
  let flash: Tween | null = null;
  let frame = 0;
  let live = false;

  const tone = () => {
    const s = getComputedStyle(canvas);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return {
      panel: v("--ph-panel"),
      ink: v("--ph-ink"),
      muted: v("--ph-muted"),
      accent: v("--ph-accent"),
    };
  };
  const at = (t: Tween, now: number) => clamp((now - t.t0) / t.ms);

  /**
   * Where everything sits for this width: the gate over the first view, the punch half a block
   * before it, and a drop to each view's centre. Stacked views share one centre, so the bus is
   * a single trunk from a gate a sixth of the way in.
   */
  const layout = () => {
    const b = w * 0.18;
    const box = canvas.getBoundingClientRect();
    const xs = drops().map((d) => {
      const r = d.getBoundingClientRect();
      return Math.round(r.left + r.width / 2 - box.left);
    });
    const stacked = new Set(xs).size < xs.length;
    const gate = stacked || !xs.length ? Math.round(w / 6) : xs[0];
    return { b, gate, writer: gate - b / 2, xs: stacked ? [gate] : xs };
  };

  function draw(now: number) {
    const c = tone();
    const { b, gate, writer, xs } = layout();
    const offset = from + (to - from) * easeOut(at(step, now));
    const y0 = TAPE.top;
    const y1 = y0 + TAPE.h;
    ctx.clearRect(0, 0, w, h);

    // the strip, and its feed holes sliding with it
    ctx.fillStyle = c.panel;
    ctx.fillRect(0, y0, w, TAPE.h);
    ctx.fillStyle = c.ink;
    ctx.fillRect(0, y0, w, 1);
    ctx.fillRect(0, y1 - 1, w, 1);
    const phase = (offset * b) % COL;
    ctx.globalAlpha = 0.45;
    for (let x = phase - COL; x < w; x += COL) dot(x, y0 + TAPE.h * SPROCKET, 1.4);
    ctx.globalAlpha = 1;

    ctx.font = '11px "Geist Pixel", monospace';
    ctx.textBaseline = "alphabetic";
    for (let k = 0; k < punched + (punching ? 1 : 0) && k < blocks.length; k++) {
      const cx = writer + (offset - k) * b;
      if (cx < -b || cx > w + b) continue;
      const share = k === punched && punching ? at(punching, now) : 1;
      block(blocks[k], cx, b, share, c);
    }

    // the punch: a die over the strip, bouncing while it works
    const bounce = punching && at(punching, now) < 1 ? Math.round(Math.sin(now / 30) * 2 + 2) : 0;
    ctx.fillStyle = c.ink;
    ctx.fillRect(writer - 7, y0 - 10 + bounce, 14, 8);
    ctx.fillRect(writer - 7, y1 + 2, 14, 5);
    label("runtime", writer, y0 - 14, c.muted, "center");

    // the gate: a head over the strip, lit while it reads
    const lit = flash ? 1 - at(flash, now) : 0;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(gate - 9) + 0.5, y0 - 8.5, 18, TAPE.h + 15);
    if (lit > 0) {
      ctx.globalAlpha = 0.25 * lit;
      ctx.fillStyle = c.accent;
      ctx.fillRect(gate - 9, y0 - 8, 18, TAPE.h + 15);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = lit > 0 ? c.accent : c.ink;
    ctx.fillRect(gate - 3, y0 - 18, 6, 6);
    label("read", gate + 8, y0 - 12, c.muted, "left");

    bus(gate, xs, y1 + 7, flash && lit > 0 ? at(flash, now) : -1, c);
  }

  function block(bl: Block, cx: number, b: number, share: number, c: ReturnType<typeof tone>) {
    const y0 = TAPE.top;
    const wide = b > 140;
    const text = wide ? bl.label : bl.short;
    // the holes always spell the whole event, as far as the block has room
    const cols = Math.min(bl.label.length, Math.floor((b - 24) / COL));
    const left = cx - b / 2;
    // clear of the gate, which stands over the newest block's edge
    const first = Math.round(left + 16);
    ctx.fillStyle = c.ink;
    for (let i = 0; i < Math.ceil(cols * share); i++) {
      const code = bl.label.charCodeAt(i) % 32;
      const x = first + i * COL + COL / 2;
      for (const [r, row] of ROWS.entries()) if (code & (1 << r)) dot(x, y0 + TAPE.h * row, 2.3);
    }
    if (share < 1) return;
    label(text, first, y0 + 16, c.ink, "left");
    // a cut mark between blocks
    ctx.globalAlpha = 0.35;
    for (let y = y0 + 4; y < y0 + TAPE.h - 4; y += 4) ctx.fillRect(Math.round(left), y, 1, 2);
    ctx.globalAlpha = 1;
  }

  function bus(gate: number, xs: number[], top: number, ride: number, c: ReturnType<typeof tone>) {
    const mid = top + BUS / 2;
    ctx.fillStyle = c.ink;
    ctx.fillRect(Math.round(gate), top, 1, mid - top);
    const lo = Math.min(gate, ...xs);
    const hi = Math.max(gate, ...xs);
    ctx.fillRect(Math.round(lo), Math.round(mid), Math.round(hi - lo) + 1, 1);
    for (const x of xs) ctx.fillRect(Math.round(x), Math.round(mid), 1, h - mid);
    if (ride < 0) return;
    ctx.fillStyle = c.accent;
    for (const x of xs) {
      const [px, py] = along(gate, top, mid, x, h, ride);
      ctx.fillRect(Math.round(px - 3), Math.round(py - 3), 6, 6);
    }
  }

  function dot(x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function label(text: string, x: number, y: number, color: string, align: CanvasTextAlign) {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  function loop() {
    draw(performance.now());
    if (live) frame = requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  const sized = new ResizeObserver(resize);
  sized.observe(canvas);
  // the theme flips a class on <html>: repaint in the new inks
  const themed = new MutationObserver(() => draw(performance.now()));
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  void document.fonts?.ready.then(() => draw(performance.now()));

  const tape: Tape = {
    reset() {
      from = to = 0;
      punched = 0;
      punching = flash = null;
    },
    punch(k, ms) {
      punched = k;
      punching = { t0: performance.now(), ms };
    },
    advance(ms) {
      if (punching) punched++;
      punching = null;
      from = to;
      to += 1;
      step = { t0: performance.now(), ms };
    },
    read(ms) {
      flash = { t0: performance.now(), ms };
    },
    rest() {
      from = to = punched = blocks.length;
      punching = flash = null;
      draw(performance.now());
    },
    running(on) {
      if (on === live) return;
      live = on;
      cancelAnimationFrame(frame);
      if (on) loop();
      else draw(performance.now());
    },
    destroy() {
      live = false;
      cancelAnimationFrame(frame);
      sized.disconnect();
      themed.disconnect();
    },
  };
  return tape;
}

/** A point `p` (0 to 1) along gate, down to the bus, across to `x`, down to the bottom */
function along(gx: number, top: number, mid: number, x: number, bottom: number, p: number) {
  const legs = [mid - top, Math.abs(x - gx), bottom - mid];
  let d = p * (legs[0] + legs[1] + legs[2]);
  if (d <= legs[0]) return [gx, top + d];
  d -= legs[0];
  if (d <= legs[1]) return [gx + Math.sign(x - gx) * d, mid];
  return [x, mid + d - legs[1]];
}
