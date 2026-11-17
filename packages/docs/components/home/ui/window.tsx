import type { ComponentProps, ReactNode } from "react";

/**
 * A window of the homepage's desktop: a hairline frame and a striped title bar with a box at
 * each end, over a dithered shadow. Its title is a file, a path or an address, so it is set as
 * code.
 */
export function Window({
  title,
  actions,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "title"> & { title: ReactNode; actions?: ReactNode }) {
  return (
    <div {...props} className={`ph-window ${className ?? ""}`}>
      <Shadow />
      <TitleBar title={title} actions={actions} />
      {children}
    </div>
  );
}

export function TitleBar({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ph-titlebar">
      <span aria-hidden className="ph-titlebar-box" />
      <span className="ph-titlebar-title">{title}</span>
      {actions ?? <span aria-hidden className="ph-titlebar-box" />}
    </div>
  );
}

/** The dithered shadow under a window, 3px right and 4px down; first child of an isolated box */
export function Shadow() {
  return <span aria-hidden className="ph-shadow" />;
}
