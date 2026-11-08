import type { Thread } from "./types";

/** Host metadata as `key=value` pairs; strings show bare, other JSON as JSON. */
export function formatMetadata(metadata: NonNullable<Thread["metadata"]>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");
}
