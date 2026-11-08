import type { KeyboardEvent } from "react";

const tabs = [
  { mode: "timeline", label: "Timeline" },
  { mode: "raw", label: "Raw events" },
] as const;

export type RunTabMode = (typeof tabs)[number]["mode"];

/** Timeline / Raw events switcher. Arrow keys move between tabs, as for any tab list. */
export function RunTabs({
  mode,
  onChange,
}: {
  mode: RunTabMode;
  onChange: (mode: RunTabMode) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.mode === mode);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const target = tabs[next];
    if (!target) return;
    onChange(target.mode);
    document.getElementById(`run-tab-${target.mode}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Run detail view"
      onKeyDown={onKeyDown}
      className="flex shrink-0 gap-1 border-b border-line px-3"
    >
      {tabs.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          id={`run-tab-${tab.mode}`}
          aria-selected={mode === tab.mode}
          aria-controls={`run-panel-${tab.mode}`}
          tabIndex={mode === tab.mode ? 0 : -1}
          onClick={() => onChange(tab.mode)}
          className="relative -mb-px h-10 cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-2.5 text-small font-medium text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-selected:border-accent aria-selected:text-fg"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
