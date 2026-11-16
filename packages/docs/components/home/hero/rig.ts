/**
 * The computer's engine. While the hero is on screen it reads one run back: an event a beat, each
 * printed on the screen, typed on a key, reported to the status bar and lighting its part down a
 * cable (every event lights the event log too). Then the cables pull out, the parts
 * go back in and the screen cats the Markdown. The title bar button takes over from the script
 * for good and swaps the two by hand. With reduced motion the server's frame stays until pressed.
 */
import { BEAT, play, TICK } from "../lib/beat";
import { report } from "../lib/status";
import { createCables } from "./cables";
import { ALT, HEAD, LOG, MD, REST, ROWS } from "./rig-data";

const TITLES = ["the harness · running", "your Markdown files"];
const LABELS = ["show the files", "show the harness"];

export function createRig(stage: HTMLElement): () => void {
  const rig = stage.querySelector<HTMLElement>(".ph-rig") as HTMLElement;
  const screen = rig.querySelector("pre") as HTMLPreElement;
  const title = stage.querySelector<HTMLElement>("[data-title]") as HTMLElement;
  const toggle = stage.querySelector<HTMLButtonElement>("[data-toggle]") as HTMLButtonElement;
  const keys = [...rig.querySelectorAll<HTMLElement>(".ph-pc-keys i")];
  const cables = createCables(rig);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let folded = false;

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  /** prints `rows`, commands in their own colour */
  const paint = (rows: string[]) => {
    screen.replaceChildren(
      ...rows.flatMap((row, i) => {
        const text = i ? `\n${row}` : row;
        if (!row.startsWith("$")) return [text];
        const cmd = document.createElement("span");
        cmd.className = "ph-pc-cmd";
        cmd.textContent = row;
        return i ? ["\n", cmd] : [cmd];
      }),
    );
  };

  const fold = (next: boolean) => {
    folded = next;
    rig.toggleAttribute("data-folded", next);
    rig.setAttribute("aria-label", ALT[next ? 1 : 0]);
    title.textContent = TITLES[next ? 1 : 0];
    toggle.textContent = LABELS[next ? 1 : 0];
    toggle.toggleAttribute("data-on", next);
  };

  const press = () => {
    const key = keys[Math.floor(Math.random() * keys.length)];
    key?.setAttribute("data-on", "");
    later(() => key?.removeAttribute("data-on"), TICK);
  };

  const light = (id: string) => {
    const part = rig.querySelector<HTMLElement>(`[data-part="${id}"]`);
    if (!part) return;
    part.removeAttribute("data-hit");
    void part.offsetWidth;
    part.setAttribute("data-hit", "");
    cables.pulse(id);
  };

  // the first pass picks up where the server's frame left off
  let from = REST.length;
  const script = play(stage, async (wait) => {
    fold(false);
    let rows = REST.slice(0, from);
    paint([...HEAD, ...rows]);
    await wait(BEAT);
    for (const [line, id] of LOG.slice(from)) {
      rows = [...rows, line].slice(-ROWS);
      paint([...HEAD, ...rows]);
      light(id);
      if (id !== "log") light("log");
      press();
      report(stage, line);
      await wait(BEAT * 1.2);
    }
    await wait(BEAT * 3);
    fold(true);
    paint([]);
    await wait(BEAT * 2);
    for (let i = 1; i <= MD.length; i++) {
      paint(MD.slice(0, i));
      press();
      await wait(TICK * 1.5);
    }
    report(stage, "2 Markdown files");
    from = 0;
    await wait(BEAT * 9);
  });

  const swap = () => {
    script();
    fold(!folded);
    paint(folded ? MD : [...HEAD, ...REST]);
  };
  toggle.addEventListener("click", swap);

  return () => {
    script();
    cables.stop();
    for (const t of timers) clearTimeout(t);
    toggle.removeEventListener("click", swap);
  };
}
