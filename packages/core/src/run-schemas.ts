import type { ToolInputSchema } from "@plico-ai/contracts";
import { normalizeInputSchema } from "./schema.js";
import type { ValidationIssue } from "./types.js";

export const RUN_SCHEMA_KEYS = ["input", "output"] as const;

/** Optional shapes an agent accepts and returns. Each is JSON Schema or a Zod schema. */
export type RunSchemas = Partial<Record<(typeof RUN_SCHEMA_KEYS)[number], ToolInputSchema>>;

/** One error per `input` or `output` value in `source` that is not a usable schema. */
export async function validateRunSchemas(
  path: string,
  source: { input?: unknown; output?: unknown } | Record<string, unknown>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const key of RUN_SCHEMA_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    if (value === undefined) continue;
    try {
      await normalizeInputSchema(value, `${path} ${key}`, path);
    } catch (error) {
      issues.push({
        path,
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }
  }
  return issues;
}
