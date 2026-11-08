import type { ButtonHTMLAttributes } from "react";

const variants = {
  default:
    "border-line bg-surface text-fg shadow-panel hover:border-faint/60 hover:bg-raised disabled:hover:border-line disabled:hover:bg-surface",
  primary:
    "border-transparent bg-primary text-on-primary shadow-panel hover:bg-primary-hover disabled:border-line disabled:bg-raised disabled:text-faint disabled:shadow-none",
  ghost:
    "border-transparent bg-transparent text-muted hover:bg-raised hover:text-fg disabled:hover:bg-transparent disabled:hover:text-muted",
  danger:
    "border-danger/40 bg-danger-soft text-danger hover:border-danger/70 disabled:hover:border-danger/40",
};

const sizes = {
  sm: "h-8 px-2.5",
  md: "min-h-9 px-3",
  icon: "size-9",
  "icon-sm": "size-8",
};

export function Button({
  variant = "default",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-control border text-small font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0 ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}
