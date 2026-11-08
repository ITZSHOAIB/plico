import { ThemeToggle } from "../theme/ThemeToggle";
import { Icon, type IconName } from "../ui/Icon";
import { Logo } from "../ui/Logo";
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
      className="order-last flex shrink-0 items-stretch border-t border-line bg-surface px-1 pb-[env(safe-area-inset-bottom)] lg:order-first lg:w-14 lg:flex-col lg:items-center lg:gap-1 lg:border-t-0 lg:border-r lg:px-0 lg:py-3"
    >
      <Logo className="mb-3 hidden size-8 lg:block" />
      {items.map((item) => (
        <button
          key={item.view}
          type="button"
          onClick={item.onSelect}
          disabled={item.disabled}
          aria-current={view === item.view ? "page" : undefined}
          className="group relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-0 bg-transparent px-0.5 py-2 text-faint transition-colors hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-faint aria-[current=page]:text-fg lg:size-10 lg:flex-none lg:p-0 lg:hover:bg-raised lg:aria-[current=page]:bg-raised"
        >
          <span
            aria-hidden="true"
            className="absolute top-0 h-0.5 w-6 rounded-full bg-accent opacity-0 transition-opacity group-aria-[current=page]:opacity-100 lg:top-1/2 lg:-left-2 lg:h-5 lg:w-0.5 lg:-translate-y-1/2"
          />
          <Icon name={item.icon} />
          <span className="max-w-full truncate text-caption leading-none font-medium lg:sr-only">
            {item.label}
          </span>
          {item.count !== undefined && <span className="sr-only"> ({item.count})</span>}
          {item.alert && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-[calc(50%-14px)] size-1.5 rounded-full bg-danger ring-2 ring-surface"
            />
          )}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-full z-20 ml-3 hidden rounded-control border border-line bg-raised px-2 py-1 text-small whitespace-nowrap text-fg opacity-0 shadow-elevated transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block"
          >
            {item.label}
          </span>
        </button>
      ))}
      <ThemeToggle className="hidden lg:mt-auto lg:grid" />
    </nav>
  );
}
