import { isDeepStrictEqual } from "node:util";
import type { EvalCheck } from "./types.js";

/** Each field under `expect.output` must match `structuredOutput`; nested objects match by subset. */
export const outputCheck: EvalCheck = (expect, run) =>
  expect.output === undefined ? [] : mismatches("output", expect.output, run.structuredOutput);

function mismatches(path: string, expected: unknown, actual: unknown): Array<{ fail: string }> {
  if (isObject(expected) && isObject(actual))
    return Object.entries(expected).flatMap(([key, value]) =>
      mismatches(`${path}.${key}`, value, actual[key]),
    );
  if (isDeepStrictEqual(expected, actual)) return [];
  return [
    {
      fail: `Expected ${path} to be ${JSON.stringify(expected)} but got ${JSON.stringify(actual) ?? "nothing"}`,
    },
  ];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
