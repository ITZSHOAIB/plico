import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** Heading styles shared by every view so titles look the same everywhere. */
export const titleClass = "m-0 break-words text-title font-semibold tracking-tight";
export const sectionHeadingClass =
  "m-0 mb-2 text-caption font-semibold tracking-wider text-faint uppercase";

/** Scrollable content area with a consistent title block. */
export function Page({
  title,
  subtitle,
  actions,
  onBack,
  backLabel,
  label,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
      tabIndex={0}
      className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <div className="animate-view-in mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="-ml-2 mb-2">
            <Icon name="back" size="sm" />
            {backLabel}
          </Button>
        )}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-display font-semibold tracking-tight break-words">{title}</h2>
            {subtitle && <div className="mt-1.5 text-body break-words text-muted">{subtitle}</div>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </section>
  );
}

export function EmptyState({ children, alert }: { children: ReactNode; alert?: boolean }) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className={`flex flex-1 items-center justify-center p-8 text-center text-body ${alert ? "text-danger" : "text-muted"}`}
    >
      {children}
    </div>
  );
}

const tones = {
  danger: "border-danger/40 bg-danger-soft text-danger",
  warning: "border-warning/40 bg-warning-soft text-warning",
};

export function Notice({
  tone = "danger",
  role = "alert",
  children,
}: {
  tone?: keyof typeof tones;
  role?: "alert" | "status";
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className={`mb-3 rounded-panel border px-3.5 py-2.5 text-small ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

export function CodeBlock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={`m-0 overflow-auto rounded-panel border border-line bg-code-bg p-4 font-mono text-small leading-relaxed break-words whitespace-pre-wrap text-code-string ${className}`}
    >
      {children}
    </pre>
  );
}

/** A full-width list row used for files, snapshots and eval results. */
export const listRowClass =
  "flex w-full cursor-pointer items-center gap-3 border-0 border-b border-line-subtle bg-transparent px-4 py-3 text-left text-inherit transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** A bordered surface that groups related content. */
export const panelClass = "rounded-panel border border-line bg-surface shadow-panel";
