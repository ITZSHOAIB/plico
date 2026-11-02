import { connectFiles } from "./connections";
import { mobileView } from "./mobile-view";
import { beats, sources } from "./story";

export function mountFileHero(root: HTMLElement) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-beat]")];
  const fileButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-file]")];
  const codePanels = [...root.querySelectorAll<HTMLElement>("[data-code]")];
  const title = root.querySelector<HTMLElement>("[data-beat-title]");
  const detail = root.querySelector<HTMLElement>("[data-beat-detail]");
  const number = root.querySelector<HTMLElement>("[data-beat-number]");
  const play = root.querySelector<HTMLButtonElement>("[data-play]");
  const playIcon = root.querySelector<HTMLElement>("[data-play-icon]");
  const answer = root.querySelector<HTMLElement>("[data-answer]");
  const event = root.querySelector<HTMLElement>("[data-event]");
  const count = root.querySelector<HTMLElement>("[data-event-count]");
  const state = root.querySelector<HTMLElement>("[data-agent-state]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const disconnect = connectFiles(root);
  const fullAnswer = answer?.textContent ?? "";
  let phase = 0,
    source = 0,
    elapsed = 0,
    last = 0,
    frame = 0;
  let playing = !reduced.matches,
    visible = false,
    disposed = false;
  const selectView = mobileView(root, () => {
    playing = false;
    syncPlay();
  });

  function selectSource(next: number, typeProgress = 1) {
    source = next;
    root.dataset.source = String(next);
    fileButtons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(index === next));
    });
    codePanels.forEach((panel, index) => {
      panel.hidden = index !== next;
    });
    const lines = sources[next]?.lines ?? [];
    let remaining = Math.floor(lines.join("").length * Math.min(1, typeProgress));
    codePanels[next]?.querySelectorAll<HTMLElement>("[data-line]").forEach((line, index) => {
      const text = lines[index] ?? "";
      const partial = text.slice(0, Math.max(0, remaining));
      remaining -= text.length;
      if (line.textContent !== (partial || " ")) line.textContent = partial || " ";
    });
  }
  function syncPlay() {
    root.dataset.playing = String(playing);
    play?.setAttribute("aria-pressed", String(playing));
    play?.setAttribute(
      "aria-label",
      playing ? "Pause animation" : reduced.matches ? "Next animation step" : "Replay animation",
    );
    if (playIcon) playIcon.textContent = playing ? "Ⅱ" : "↻";
  }
  function draw(progress: number) {
    root.style.setProperty("--fh-progress", String(progress));
    buttons.forEach((button, index) => {
      const track = button.querySelector<HTMLElement>("i");
      if (track)
        track.style.transform = `scaleX(${index < phase ? 1 : index === phase ? progress : 0})`;
    });
    if (phase === 0) selectSource(0, playing ? Math.min(1, progress * 1.6 + 0.05) : 1);
    if (phase === 1 && playing)
      selectSource(
        progress < 0.48 ? 1 : 2,
        Math.min(1, (progress < 0.48 ? progress : progress - 0.48) * 3.5 + 0.1),
      );
    if (phase === 2) selectSource(source, 1);
    const runStep =
      phase !== 3
        ? 0
        : progress < 0.08
          ? 0
          : progress < 0.26
            ? 1
            : progress < 0.55
              ? 2
              : progress < 0.92
                ? 3
                : 4;
    root.dataset.runStep = String(runStep);
    for (const [selector, threshold] of [
      [".fh-placeholder", -1],
      [".fh-request", 1],
      [".fh-tool", 2],
      [".fh-answer", 3],
    ] as const) {
      root
        .querySelector(selector)
        ?.setAttribute(
          "aria-hidden",
          String(threshold === -1 ? phase === 3 : phase !== 3 || runStep < threshold),
        );
    }
    if (event)
      event.textContent =
        phase === 0
          ? "Waiting for your files"
          : phase === 1
            ? "skill + tool added"
            : phase === 2
              ? "instructions.composed → tools.discovered"
              : ([
                  "run.started",
                  "assistant.output",
                  "tool.call · create_ticket",
                  "tool.result · TCK-104",
                  "run.completed",
                ][runStep] ?? "run.started");
    if (count)
      count.textContent =
        phase === 3
          ? (["01 / 07", "04 / 07", "05 / 07", "06 / 07", "07 / 07"][runStep] ?? "")
          : "—";
    if (state)
      state.textContent =
        phase < 2
          ? "defined by your files"
          : phase === 2
            ? "project loaded"
            : runStep === 4
              ? "completed"
              : "running";
    if (answer) {
      const text =
        reduced.matches || !playing
          ? fullAnswer
          : fullAnswer.slice(
              0,
              Math.ceil(Math.max(0, (progress - 0.58) / 0.29) * fullAnswer.length),
            );
      if (answer.textContent !== text) answer.textContent = text;
    }
  }
  function setPhase(next: number, manual = false) {
    phase = next;
    elapsed = 0;
    root.dataset.phase = String(phase);
    selectView(phase);
    const beat = beats[phase];
    if (!beat) return;
    if (manual) {
      playing = false;
      syncPlay();
    }
    if (title) title.textContent = beat.title;
    if (detail) detail.textContent = beat.detail;
    if (number) number.textContent = `0${phase + 1} / 04`;
    buttons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(index === phase));
    });
    if (phase === 1) selectSource(1);
    if (phase >= 2) selectSource(2);
    draw(manual || reduced.matches ? 1 : 0);
  }
  function tick(now: number) {
    frame = 0;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (playing && visible && !document.hidden && !reduced.matches) {
      elapsed += dt;
      const duration = beats[phase]?.duration ?? 5000;
      if (elapsed > duration) setPhase((phase + 1) % beats.length);
      else draw(elapsed / duration);
      run();
    }
  }
  function run() {
    if (!frame && visible && playing && !document.hidden && !reduced.matches && !disposed)
      frame = requestAnimationFrame(tick);
  }
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => setPhase(index, true));
  });
  fileButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      setPhase(index === 0 ? 0 : 1, true);
      selectSource(index);
    });
  });
  play?.addEventListener("click", () => {
    playing = !playing;
    if (playing && reduced.matches) {
      setPhase((phase + 1) % beats.length, true);
      return;
    }
    if (playing) {
      setPhase(0);
      last = 0;
    }
    syncPlay();
    run();
  });
  function motionChanged() {
    playing = !reduced.matches;
    setPhase(phase, reduced.matches);
    syncPlay();
    last = 0;
    run();
  }
  reduced.addEventListener("change", motionChanged);
  function visibilityChanged() {
    last = 0;
    run();
  }
  document.addEventListener("visibilitychange", visibilityChanged);
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.at(-1)?.isIntersecting ?? false;
      root.dataset.visible = String(visible);
      last = 0;
      if (visible) run();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    { threshold: 0.12 },
  );
  observer.observe(root);
  document.addEventListener(
    "astro:before-swap",
    () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      disconnect();
      reduced.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    },
    { once: true },
  );
  setPhase(0);
  syncPlay();
  if (reduced.matches) draw(1);
}
