import type { JsonSchema } from "@plico-ai/contracts";
import type { LoadedProject } from "@plico-ai/core";
import type { InMemoryEventLog } from "../../events.js";
import { stubValue } from "./schema-stub.js";

export async function runDefaultDryRun(
  project: LoadedProject,
  events: InMemoryEventLog,
  outputSchema?: JsonSchema,
): Promise<string> {
  const output =
    outputSchema === undefined
      ? `Dry run complete for ${project.config.name}.`
      : JSON.stringify(stubValue(outputSchema));
  await events.append("assistant.output", { content: output });
  return output;
}
