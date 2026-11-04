import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** Heading styles shared by every view so titles look the same everywhere. */
export const titleClass = "m-0 break-words text-title font-semibold";
export const sectionHeadingClass = "m-0 mb-1.5 text-small font-semibold";

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
    <section aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="-ml-2 mb-2">
            <Icon name="back" size="sm" />
            {backLabel}
          </Button>
        )}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={titleClass}>{title}</h2>
            {subtitle && <div className="mt-1 text-small break-words text-muted">{subtitle}</div>}
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
      className={`flex flex-1 items-center justify-center p-8 text-center ${alert ? "text-danger" : "text-muted"}`}
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
    <div role={role} className={`mb-3 rounded-control border px-3 py-2 text-small ${tones[tone]}`}>
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
      className={`m-0 overflow-auto whitespace-pre-wrap break-words rounded-panel border border-line bg-bg p-3 font-mono text-small text-code-string ${className}`}
    >
      {children}
    </pre>
  );
}

/** A full-width list row used for files, snapshots and eval results. */
export const listRowClass =
  "flex w-full cursor-pointer items-center gap-3 border-0 border-b border-line-subtle bg-transparent px-3 py-2.5 text-left text-inherit hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent";
