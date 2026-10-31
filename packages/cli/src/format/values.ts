export function readCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
