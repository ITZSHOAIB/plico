import type { PlicoEvent, RunStatus } from "@plico-ai/contracts";
import type { DryRunScriptStep, EvalCase } from "../types/index.js";

/**
 * Turns a stored run into an eval case. Each tool call keeps the output it produced as the mocked
 * `result`, so the case replays without running any handler. Files a tool wrote are not carried over.
 * The expectation checks the run's status and its structured output, or its text output.
 */
export function evalCaseFromRun(name: string, status: RunStatus, events: PlicoEvent[]): EvalCase {
  const script: DryRunScriptStep[] = [];
  let output: string | undefined;
  let structuredOutput: unknown;
  let pending: Extract<DryRunScriptStep, { type: "tool.call" }> | undefined;
  for (const event of events) {
    if (event.type === "assistant.output") {
      script.push({ type: "assistant.output", content: event.payload.content });
      output = event.payload.content;
    } else if (event.type === "tool.call") {
      pending = {
        type: "tool.call",
        toolName: event.payload.toolName,
        arguments: event.payload.arguments,
      };
      script.push(pending);
    } else if (event.type === "tool.result" && pending) {
      pending.result = event.payload.result;
      pending = undefined;
    } else if (event.type === "run.completed") {
      structuredOutput = event.payload.structuredOutput;
    }
  }
  const checks =
    structuredOutput !== null &&
    typeof structuredOutput === "object" &&
    !Array.isArray(structuredOutput)
      ? { output: structuredOutput as Record<string, unknown> }
      : output === undefined
        ? {}
        : { contains: output };
  return { name, script, expect: { status, ...checks } };
}
