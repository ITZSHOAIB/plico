import { Icon } from "../ui/Icon";
import { useTheme } from "./theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`grid size-9 cursor-pointer place-items-center rounded-control border-0 bg-transparent text-muted hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
