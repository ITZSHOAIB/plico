import type { LoadedProject } from "@plico/core";
import type { InMemoryEventLog } from "../../events.js";

export async function runDefaultDryRun(
  project: LoadedProject,
  events: InMemoryEventLog,
): Promise<string> {
  const output = `Dry run complete for ${project.config.name}.`;
  events.append("assistant.output", { content: output });
  return output;
}
