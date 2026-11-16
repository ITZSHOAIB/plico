/**
 * The cables between the computer and its parts. Each runs from a socket on the monitor's side to
 * the part's inner edge, an S-curve drawn in the rig's own pixels, redrawn whenever the rig
 * resizes. Positions come from layout offsets, not boxes, so a part mid-fold still draws true.
 */
import { BEAT, EASE_OUT, isPaused, reduced } from "../lib/beat";

/** where `el` sits inside `rig`, ignoring transforms */
function offset(el: HTMLElement, rig: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== rig; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function createCables(rig: HTMLElement) {
  const svg = rig.querySelector("svg") as SVGSVGElement;
  const monitor = rig.querySelector<HTMLElement>(".ph-pc-monitor") as HTMLElement;
  const cables = [...svg.querySelectorAll<SVGGElement>("[data-cable]")];

  const draw = () => {
    svg.setAttribute("viewBox", `0 0 ${rig.clientWidth} ${rig.clientHeight}`);
    const m = offset(monitor, rig);
    const sockets = { l: 0, r: 0 };
    for (const cable of cables) {
      const part = rig.querySelector<HTMLElement>(`[data-part="${cable.dataset.cable}"]`);
      if (!part) continue;
      const side = part.dataset.side === "l" ? "l" : "r";
      const s = side === "l" ? -1 : 1;
      const p = offset(part, rig);
      const sx = side === "l" ? m.x : m.x + m.w;
      const sy = m.y + m.h * (0.22 + sockets[side]++ * 0.14);
      const ex = side === "l" ? p.x + p.w : p.x;
      const ey = p.y + p.h / 2;
      const bend = Math.abs(ex - sx) * 0.6;
      const d = `M${sx} ${sy} C${sx + s * bend} ${sy} ${ex - s * bend} ${ey} ${ex} ${ey}`;
      for (const path of cable.children) path.setAttribute("d", d);
    }
  };

  const ro = new ResizeObserver(draw);
  ro.observe(rig);
  // late web fonts move the parts without resizing the rig
  void document.fonts?.ready.then(draw);

  /** sends one packet down a part's cable, from the computer out */
  const pulse = (id: string) => {
    if (reduced() || isPaused()) return;
    const packet = svg.querySelector(`[data-cable="${id}"] .ph-cable-packet`);
    packet?.animate([{ strokeDashoffset: 0.1 }, { strokeDashoffset: -1 }], {
      duration: BEAT * 1.4,
      easing: EASE_OUT,
    });
  };

  return { pulse, stop: () => ro.disconnect() };
}
