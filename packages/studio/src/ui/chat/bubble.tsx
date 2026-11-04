// Adapted from shadcn/ui bubble (MIT), Copyright (c) shadcn.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/bubble.tsx
import type { ComponentProps } from "react";

export function Bubble({
  className = "",
  variant = "muted",
  ...props
}: ComponentProps<"div"> & { variant?: "muted" | "ghost" }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      className={`group/bubble relative flex w-fit max-w-[90%] min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[variant=ghost]:max-w-full ${className}`}
      {...props}
    />
  );
}

export function BubbleContent({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-content"
      className={`w-fit max-w-full min-w-0 rounded-xl border border-transparent bg-raised px-4 py-3 text-body leading-relaxed whitespace-pre-wrap wrap-break-word group-data-[variant=ghost]/bubble:bg-transparent group-data-[variant=ghost]/bubble:p-0 ${className}`}
      {...props}
    />
  );
}
