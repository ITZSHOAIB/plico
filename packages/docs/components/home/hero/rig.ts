/**
 * The hero's engine. While it is on screen it tells one story, over and over: the agent's files go
 * into the drive disk by disk, the screen boots into a chat, the reader's question types itself
 * on the keyboard, and the agent answers through a skill, an approval and a tool call, each step
 * reported to the status bar. Then the disks eject and it starts again. With reduced motion the
 * finished chat shows, still.
 */
import { BEAT, play, reduced, TICK } from "../lib/beat";
import { report } from "../lib/status";
import { ALT, ANSWER, ASK, FILES, TITLES, TOOL, TOOL_RESULT } from "./rig-data";
import { createScreen } from "./screen";

const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

export function createRig(stage: HTMLElement): () => void {
  const rig = stage.querySelector<HTMLElement>(".ph-rig") as HTMLElement;
  const title = stage.querySelector<HTMLElement>("[data-title]") as HTMLElement;
  const disks = [...rig.querySelectorAll<HTMLElement>(".ph-disk")];
  const slot = rig.querySelector<HTMLElement>(".ph-pc-slot") as HTMLElement;
  const led = rig.querySelector<HTMLElement>(".ph-pc-led") as HTMLElement;
  const keys = [...rig.querySelectorAll<HTMLElement>(".ph-pc-keys i")];
  const pointer = rig.querySelector<SVGElement>(".ph-pointer") as SVGElement;
  const screen = createScreen(rig.querySelector(".ph-pc-screen") as HTMLElement);

  const scene = (name: keyof typeof TITLES, alt: 0 | 1) => {
    title.textContent = TITLES[name];
    rig.setAttribute("aria-label", ALT[alt]);
  };

  const press = () => {
    const key = keys[Math.floor(Math.random() * keys.length)];
    const accent = getComputedStyle(rig).getPropertyValue("--ph-accent");
    key?.animate({ background: [accent, accent] }, TICK);
  };

  /** a disk flies to the drive, squares up over the slot and slides in; `back` ejects it */
  const insert = (disk: HTMLElement, back = false) => {
    const d = disk.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    const scale = s.width / d.width;
    const dx = s.left + s.width / 2 - (d.left + d.width / 2);
    const dy = s.top - d.bottom;
    const frames: Keyframe[] = [
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx}px, ${dy - 8}px) scale(${scale})`, opacity: 1, offset: 0.62 },
      {
        transform: `translate(${dx}px, ${dy + d.height * scale * 0.5}px) scale(${scale}, 0.02)`,
        opacity: 0,
      },
    ];
    if (back) frames.reverse();
    const duration = back ? BEAT * 1.3 : BEAT * 1.9;
    disk.animate(frames, { duration, easing: EASE_IN_OUT, fill: "forwards" });
    return duration;
  };

  /** the pointer glides onto `target` */
  const point = (target: HTMLElement) => {
    const r = target.getBoundingClientRect();
    const base = rig.getBoundingClientRect();
    pointer.style.translate = `${r.left - base.left + r.width * 0.55}px ${r.top - base.top + r.height * 0.5}px`;
    pointer.setAttribute("data-on", "");
  };

  const click = (target: Element) =>
    target.animate({ scale: [1, 0.9, 1] }, { duration: TICK * 1.5, easing: "ease-out" });

  const reset = () => {
    for (const disk of disks) for (const a of disk.getAnimations()) a.cancel();
    pointer.removeAttribute("data-on");
    led.removeAttribute("data-on");
    screen.reset();
    scene("idle", 0);
  };

  if (reduced()) {
    for (const disk of disks) disk.style.visibility = "hidden";
    screen.finished(ASK);
    scene("done", 1);
    return () => {};
  }

  const script = play(stage, async (wait) => {
    reset();
    await wait(BEAT * 3);

    // the files go in, a disk each
    scene("loading", 0);
    screen.say("loading agent", "reading files…");
    for (const [k, disk] of disks.entries()) {
      await wait(insert(disk));
      led.setAttribute("data-on", "");
      screen.say("loading agent", `reading ${FILES[k]?.name}…`);
      report(stage, `loaded ${FILES[k]?.name}`);
      await wait(BEAT * 0.75);
      led.removeAttribute("data-on");
      screen.loaded(k);
      await wait(BEAT * 0.45);
    }
    screen.say("support-agent ready", "starting chat…");
    scene("ready", 0);
    await wait(BEAT * 2.2);

    // the chat boots and the question types itself
    screen.chat();
    scene("ready", 1);
    await wait(BEAT * 1.8);
    for (let i = 1; i <= ASK.length; i++) {
      screen.type(ASK.slice(0, i));
      press();
      await wait(ASK[i - 1] === " " ? TICK * 0.55 : TICK * 0.3);
    }
    await wait(BEAT * 0.5);
    click(screen.send);
    await wait(TICK);
    screen.sent(ASK);
    scene("running", 1);
    report(stage, "run.started");
    await wait(BEAT * 0.7);

    // the agent works: a skill, then a tool that waits for a person
    const turn = screen.agent();
    await wait(BEAT * 2.6);
    const skill = screen.step(turn, "run", "load_skill", "triage");
    report(stage, "tool.call load_skill");
    await wait(BEAT * 1.4);
    skill("ok", "triage");
    await wait(BEAT * 0.7);
    const tool = screen.step(turn, "wait", TOOL.name, TOOL.args);
    await wait(BEAT * 0.8);
    const { card, approve, approved } = screen.approval(turn);
    report(stage, `approval.requested ${TOOL.name}`);
    await wait(BEAT * 1.4);
    point(approve);
    await wait(BEAT * 1.5);
    click(approve);
    await wait(TICK * 1.5);
    pointer.removeAttribute("data-on");
    approved();
    report(stage, "approval.decided approved");
    tool("run", TOOL.args);
    await wait(BEAT * 1.6);
    card.remove();
    turn.hidden = false;
    tool("ok", `→ ${TOOL_RESULT}`);
    report(stage, `tool.result ${TOOL.name}`);
    await wait(BEAT);

    // the reply streams in and the thread gets its title
    const words = ANSWER.split(" ");
    for (let i = 1; i <= words.length; i++) {
      screen.answer(turn, words.slice(0, i).join(" "), i === words.length);
      await wait(TICK * 0.45);
    }
    screen.titled();
    scene("done", 1);
    report(stage, "run.completed");
    await wait(BEAT * 10);

    // the disks come back out
    screen.reset();
    scene("idle", 0);
    for (const disk of [...disks].reverse()) await wait(insert(disk, true));
    await wait(BEAT);
  });

  return () => {
    script();
    reset();
  };
}
