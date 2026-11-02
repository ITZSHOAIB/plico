import { sources } from "./story";

export function codeEditor(root: HTMLElement) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-file]")];
  const panels = [...root.querySelectorAll<HTMLElement>("[data-code]")];
  const rows = panels.map((panel) => [...panel.querySelectorAll<HTMLElement>("[data-line]")]);
  return (next: number, progress = 1, typing = false) => {
    root.dataset.source = String(next);
    buttons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(index === next));
    });
    panels.forEach((panel, index) => {
      panel.hidden = index !== next;
    });
    const lines = sources[next]?.lines ?? [];
    let remaining = Math.floor(lines.join("\n").length * Math.max(0, Math.min(1, progress)));
    rows[next]?.forEach((row, index) => {
      const text = lines[index] ?? "";
      const partial = text.slice(0, Math.max(0, remaining));
      const typed = row.querySelector<HTMLElement>("[data-typed]");
      if (typed && typed.textContent !== partial) typed.textContent = partial;
      row.dataset.caret = String(
        typing && progress < 1 && remaining >= 0 && remaining <= text.length,
      );
      remaining -= text.length + 1;
    });
  };
}
