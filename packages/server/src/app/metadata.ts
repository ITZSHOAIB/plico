import type { JsonValue } from "@plico/contracts";
import { PlicoError } from "./errors.js";

export type Metadata = Record<string, JsonValue>;

/** Accepts a plain JSON object and returns it; anything else is a `request.invalid` error. */
export function readMetadata(value: unknown, name = "metadata"): Metadata | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || !isJson(value))
    throw new PlicoError("request.invalid", `${name} must be a JSON object.`);
  return value as Metadata;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isPlainObject(value) && Object.values(value).every(isJson);
}
