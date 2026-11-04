import type { ButtonHTMLAttributes } from "react";

const variants = {
  default: "border-line bg-raised text-fg hover:border-faint",
  primary: "border-accent bg-accent text-on-accent hover:opacity-90",
  ghost: "border-transparent bg-transparent text-muted hover:bg-raised hover:text-fg",
};

const sizes = {
  md: "min-h-9 px-3",
  icon: "size-9",
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
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-control border text-small font-medium focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}
