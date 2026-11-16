import type { JsonSchema } from "@plico-ai/contracts";
import { type LoadedProject, readRunSchemas } from "@plico-ai/core";

/** Frontmatter wins over config, using the same normalizer as input and tool schemas. */
export async function readOutputSchema(project: LoadedProject): Promise<JsonSchema | undefined> {
  return (await readRunSchemas(project)).output?.jsonSchema;
}
