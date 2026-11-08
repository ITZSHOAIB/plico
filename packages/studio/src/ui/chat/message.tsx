// Adapted from shadcn/ui message (MIT), Copyright (c) shadcn.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/message.tsx
import type { ComponentProps } from "react";

export function Message({
  className = "",
  align = "start",
  ...props
}: ComponentProps<"article"> & { align?: "start" | "end" }) {
  return (
    <article
      data-slot="message"
      data-align={align}
      className={`group/message relative flex w-full min-w-0 gap-3 text-body data-[align=end]:flex-row-reverse ${className}`}
      {...props}
    />
  );
}

export function MessageAvatar({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-avatar"
      className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised text-muted ${className}`}
      {...props}
    />
  );
}

export function MessageContent({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={`flex w-full min-w-0 flex-col gap-2 wrap-break-word group-data-[align=end]/message:items-end ${className}`}
      {...props}
    />
  );
}

export function MessageHeader({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={`flex max-w-full min-w-0 items-center gap-2 text-small font-medium text-muted ${className}`}
      {...props}
    />
  );
}

export function MessageFooter({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={`flex max-w-full min-w-0 items-center text-caption text-muted group-data-[align=end]/message:justify-end ${className}`}
      {...props}
    />
  );
}
