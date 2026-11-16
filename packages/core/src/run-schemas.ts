import { readFile } from "node:fs/promises";
import type { ToolInputSchema } from "@plico-ai/contracts";
import { parseAgentFile } from "./agent-file.js";
import { getProjectPaths } from "./layout.js";
import { type NormalizedInputSchema, normalizeInputSchema } from "./schema.js";
import type { LoadedProject, ValidationIssue } from "./types.js";

export const RUN_SCHEMA_KEYS = ["input", "output"] as const;

/** Optional shapes an agent accepts and returns. Each is JSON Schema or a Zod schema. */
export type RunSchemas = Partial<Record<(typeof RUN_SCHEMA_KEYS)[number], ToolInputSchema>>;

/**
 * One error per `input` or `output` value in `source` that is not a usable schema. `path` labels the
 * issue; `file` is the absolute path a Zod schema resolves its `zod` package from.
 */
export async function validateRunSchemas(
  path: string,
  file: string,
  source: { input?: unknown; output?: unknown } | Record<string, unknown>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const key of RUN_SCHEMA_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    if (value === undefined) continue;
    try {
      await normalizeInputSchema(value, `${path} ${key}`, file);
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

/** The agent's declared schemas. `agent.md` frontmatter wins over `plico.config.ts`. */
export async function readRunSchemas(
  project: LoadedProject,
): Promise<Partial<Record<(typeof RUN_SCHEMA_KEYS)[number], NormalizedInputSchema>>> {
  const { agentFile } = getProjectPaths(project.root);
  const frontmatter = parseAgentFile(await readFile(agentFile, "utf8")).data;
  const schemas: Partial<Record<(typeof RUN_SCHEMA_KEYS)[number], NormalizedInputSchema>> = {};
  for (const key of RUN_SCHEMA_KEYS) {
    const declared = frontmatter[key] ?? project.config[key];
    if (declared === undefined) continue;
    const file = frontmatter[key] === undefined ? project.configPath : agentFile;
    schemas[key] = await normalizeInputSchema(declared, key, file);
  }
  return schemas;
}
