// Adapted from shadcn/ui input-group (MIT), Copyright (c) shadcn.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/input-group.tsx
import type { ComponentProps } from "react";

export function InputGroup({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={`group/input-group relative flex w-full min-w-0 flex-col rounded-xl border border-line bg-surface shadow-sm transition-[border-color,box-shadow] has-[[data-slot=input-group-control]:focus-visible]:border-accent has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-accent/20 ${className}`}
      {...props}
    />
  );
}
export function InputGroupTextarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={`min-h-20 w-full resize-none rounded-xl border-0 bg-transparent px-4 pt-4 pb-2 text-body leading-relaxed text-fg outline-none placeholder:text-muted ${className}`}
      {...props}
    />
  );
}
export function InputGroupAddon({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group-addon"
      data-align="block-end"
      className={`flex w-full items-center justify-between gap-2 px-3 pb-3 text-small text-muted ${className}`}
      {...props}
    />
  );
}
