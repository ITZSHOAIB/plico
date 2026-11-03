import type { ButtonHTMLAttributes } from "react";

const variants = {
  default: "border-line bg-raised text-fg hover:border-faint",
  primary: "border-accent bg-accent text-on-accent hover:opacity-90",
  ghost: "border-transparent bg-transparent text-muted hover:bg-raised hover:text-fg",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}
