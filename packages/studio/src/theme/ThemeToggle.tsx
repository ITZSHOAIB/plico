import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useTheme } from "./theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={className}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </Button>
  );
}
