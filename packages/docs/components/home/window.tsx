import type { ReactNode } from "react";

/** A plain paper panel with a filename-style header. */
export function Panel({
  title,
  meta,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ph-panel ${className ?? ""}`}>
      <div className="ph-panel-bar">
        <span>{title}</span>
        {meta ? <span className="ph-panel-meta">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * A section heading. The kicker reads like an entry in Plico's event log, so the page itself
 * walks through a run: `01 project.loaded`, `02 run.started`, and so on.
 */
export function Heading({
  seq,
  event,
  children,
}: {
  seq: number;
  event: string;
  children: ReactNode;
}) {
  return (
    <div className="ph-heading">
      <p className="ph-kicker">
        <span>{String(seq).padStart(2, "0")}</span>
        {event}
      </p>
      <h2>{children}</h2>
    </div>
  );
}
