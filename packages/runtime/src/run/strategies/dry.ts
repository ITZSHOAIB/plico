import type { JsonSchema, RunResult } from "@plico-ai/contracts";
import type { LoadedProject } from "@plico-ai/core";
import type { RunContext } from "../../engine/index.js";
import type { InMemoryEventLog } from "../../events.js";
import type { DeclaredTool, DryRunScriptStep, EventStore } from "../../types/index.js";
import type { AgentToolset } from "../agents/types.js";
import { validateStructuredText } from "../structured-output.js";
import { runDefaultDryRun } from "./default-dry.js";
import { runScriptedDryRun } from "./scripted.js";

/** A dry run supplies its final JSON itself; it cannot ask a model to repair it. */
export async function runDryStrategy(
  ctx: RunContext,
  project: LoadedProject,
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  eventStore: EventStore | undefined,
  script: DryRunScriptStep[] | undefined,
  mockTools: boolean,
  outputSchema: JsonSchema | undefined,
  toolset?: AgentToolset,
): Promise<Pick<RunResult, "output" | "structuredOutput">> {
  const output =
    script === undefined
      ? await runDefaultDryRun(project, events, outputSchema)
      : await runScriptedDryRun(
          ctx,
          script,
          tools,
          events,
          eventStore,
          project.config,
          mockTools,
          toolset,
        );
  const structuredOutput =
    outputSchema === undefined ? undefined : await validateStructuredText(outputSchema, output);
  return {
    ...(output === undefined ? {} : { output }),
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
  };
}
