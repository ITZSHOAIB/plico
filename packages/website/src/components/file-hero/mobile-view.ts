export function mobileView(root: HTMLElement, pause: () => void) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-mobile-view]")];
  function select(view: "files" | "agent") {
    root.dataset.view = view;
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mobileView === view));
    });
  }
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      pause();
      select(button.dataset.mobileView === "agent" ? "agent" : "files");
    });
  });
  return (phase: number) => {
    // Keep manual desktop selections from hiding the relevant pane after resize.
    select(phase < 2 ? "files" : "agent");
  };
}
