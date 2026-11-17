import type { EvalCase, RunProjectOptions } from "../types/index.js";

type FixtureResult = { result: unknown } | undefined;

/**
 * Tool results for one live run: the case's `mocks` first, then with `mockTools` the fixture's
 * `tool.call` results in order per tool, then the real handler. Call once per trial.
 */
export function liveToolResults(
  evalCase: EvalCase,
  mockTools: boolean,
): RunProjectOptions["mockToolResult"] {
  const mocks = evalCase.mocks ?? {};
  if (!mockTools && Object.keys(mocks).length === 0) return undefined;

  const queues = new Map<string, FixtureResult[]>();
  for (const step of evalCase.script ?? []) {
    if (step.type !== "tool.call" || (!("result" in step) && !step.live)) continue;
    const queue = queues.get(step.toolName) ?? [];
    queue.push(step.live ? undefined : { result: step.result });
    queues.set(step.toolName, queue);
  }

  return (toolName) => {
    if (Object.hasOwn(mocks, toolName)) return { result: mocks[toolName] };
    if (!mockTools) return undefined;
    const queue = queues.get(toolName);
    if (!queue?.length)
      throw new Error(
        `No fixture result for tool ${toolName}: --mock-tools takes every tool result from the case's .script.json.`,
      );
    return queue.shift();
  };
}
