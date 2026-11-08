import type { PlicoEvent, RunStatus } from "@plico/contracts";
import type { DryRunScriptStep, EvalCase } from "../types/index.js";

/**
 * Turns a stored run into an eval case. Each tool call keeps the output it produced as the mocked
 * `result`, so the case replays without running any handler. Files a tool wrote are not carried over.
 */
export function evalCaseFromRun(name: string, status: RunStatus, events: PlicoEvent[]): EvalCase {
  const script: DryRunScriptStep[] = [];
  let output: string | undefined;
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
    }
  }
  return {
    name,
    script,
    expect: { status, ...(output === undefined ? {} : { outputContains: output }) },
  };
}
