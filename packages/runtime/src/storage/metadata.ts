import type { JsonValue } from "@plico/contracts";

export type Metadata = Record<string, JsonValue>;

/** True when every top-level key of `filter` equals the same key of `metadata`, compared as JSON. */
export function matchesMetadata(
  metadata: Metadata | undefined,
  filter: Metadata | undefined,
): boolean {
  if (filter === undefined) return true;
  return Object.entries(filter).every(
    ([key, value]) =>
      metadata !== undefined &&
      Object.hasOwn(metadata, key) &&
      sameJson(metadata[key] as JsonValue, value),
  );
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index] as JsonValue))
    );
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) && sameJson(left[key] as JsonValue, right[key] as JsonValue),
    )
  );
}

export function parseMetadata(json: unknown): Metadata | undefined {
  return typeof json === "string" ? (JSON.parse(json) as Metadata) : undefined;
}
