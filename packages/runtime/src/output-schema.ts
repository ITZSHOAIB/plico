import { readFile } from "node:fs/promises";
import type { JsonSchema } from "@plico-ai/contracts";
import {
  getProjectPaths,
  type LoadedProject,
  normalizeInputSchema,
  parseAgentFile,
} from "@plico-ai/core";

/** Frontmatter wins over config, using the same normalizer as input and tool schemas. */
export async function readOutputSchema(project: LoadedProject): Promise<JsonSchema | undefined> {
  const { agentFile } = getProjectPaths(project.root);
  const frontmatter = parseAgentFile(await readFile(agentFile, "utf8")).data;
  const declared = frontmatter.output ?? project.config.output;
  return declared === undefined
    ? undefined
    : (await normalizeInputSchema(declared, "output", agentFile)).jsonSchema;
}
