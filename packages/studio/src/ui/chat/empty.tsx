// Adapted from shadcn/ui empty (MIT), Copyright (c) shadcn.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/empty.tsx
import type { ComponentProps } from "react";

export function Empty({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center text-balance md:p-12 ${className}`}
      {...props}
    />
  );
}
export function EmptyHeader({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={`flex max-w-sm flex-col items-center gap-2 text-center ${className}`}
      {...props}
    />
  );
}
export function EmptyMedia({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-icon"
      className={`mb-2 flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-muted ${className}`}
      {...props}
    />
  );
}
export function EmptyTitle({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={`text-title font-semibold tracking-tight ${className}`}
      {...props}
    />
  );
}
export function EmptyDescription({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-description"
      className={`text-body leading-relaxed text-muted ${className}`}
      {...props}
    />
  );
}
