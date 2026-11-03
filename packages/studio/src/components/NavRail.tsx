import { ThemeToggle } from "../theme/ThemeToggle";
import { Icon, type IconName } from "../ui/Icon";
import type { View } from "../view";

export interface NavItem {
  view: View;
  label: string;
  icon: IconName;
  onSelect: () => void;
  count?: number;
  disabled?: boolean;
  alert?: boolean;
}

/** Desktop: a slim icon rail on the left. Mobile: a bottom tab bar with labels. */
export function NavRail({ items, view }: { items: NavItem[]; view: View }) {
  return (
    <nav
      aria-label="Studio sections"
      className="order-last flex shrink-0 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:order-first lg:w-[52px] lg:flex-col lg:items-center lg:gap-1.5 lg:border-t-0 lg:border-r lg:py-3 lg:pb-3"
    >
      <div
        aria-hidden="true"
        className="mb-2 hidden size-7 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent lg:grid"
      >
        P
      </div>
      {items.map((item) => (
        <button
          key={item.view}
          type="button"
          onClick={item.onSelect}
          disabled={item.disabled}
          title={item.label}
          aria-current={view === item.view ? "page" : undefined}
          className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 py-2 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35 aria-[current=page]:text-accent lg:size-9 lg:flex-none lg:rounded-control lg:p-0 lg:hover:bg-raised lg:aria-[current=page]:bg-raised"
        >
          <Icon name={item.icon} size={18} />
          <span className="text-[10px] leading-none lg:sr-only">{item.label}</span>
          {item.count !== undefined && <span className="sr-only"> ({item.count})</span>}
          {item.alert && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-[calc(50%-14px)] size-1.5 rounded-full bg-danger"
            />
          )}
        </button>
      ))}
      <ThemeToggle className="hidden lg:mt-auto lg:grid" />
    </nav>
  );
}
