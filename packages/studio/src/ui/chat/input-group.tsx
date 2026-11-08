// Adapted from shadcn/ui input-group (MIT), Copyright (c) shadcn.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/input-group.tsx
import type { ComponentProps } from "react";

export function InputGroup({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={`group/input-group relative flex w-full min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-elevated transition-[border-color,box-shadow] has-[[data-slot=input-group-control]:focus-visible]:border-accent/70 has-[[data-slot=input-group-control]:focus-visible]:ring-4 has-[[data-slot=input-group-control]:focus-visible]:ring-accent/15 ${className}`}
      {...props}
    />
  );
}
export function InputGroupTextarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={`field-sizing-content max-h-60 min-h-14 w-full resize-none rounded-2xl border-0 bg-transparent px-4 pt-3.5 pb-1 text-reading text-fg outline-none placeholder:text-faint ${className}`}
      {...props}
    />
  );
}
export function InputGroupAddon({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group-addon"
      data-align="block-end"
      className={`flex w-full items-center justify-between gap-2 px-3 pb-2.5 pl-4 text-small text-muted ${className}`}
      {...props}
    />
  );
}
