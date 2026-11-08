import type { Thread } from "../../types";

/** A thread's title, or a short id until the conversation has a topic. */
export function threadLabel(thread: Thread): string {
  return thread.title ?? `Thread ${thread.id.slice(0, 8)}`;
}
