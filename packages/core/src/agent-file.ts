import { type Frontmatter, parseFrontmatter } from "./frontmatter.js";
import type { ValidationIssue } from "./types.js";

/** Frontmatter keys `agent.md` understands. Later features add keys here without breaking projects. */
export const AGENT_FRONTMATTER_KEYS: readonly string[] = [];

/** Splits `agent.md` into its frontmatter and the instructions the model sees. */
export function parseAgentFile(text: string): Frontmatter {
  return parseFrontmatter(text);
}

/** One warning per frontmatter key that `agent.md` does not understand. */
export function unknownAgentKeyWarnings(
  path: string,
  data: Frontmatter["data"],
): ValidationIssue[] {
  return Object.keys(data)
    .filter((key) => !AGENT_FRONTMATTER_KEYS.includes(key))
    .map((key) => ({
      path,
      message: `Unknown frontmatter key "${key}" in ${path}. It is ignored and never sent to the model.`,
      severity: "warning" as const,
    }));
}
