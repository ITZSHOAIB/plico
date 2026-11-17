import type { RunResult } from "../../types/index.js";
import type { CheckFinding, EvalCheck } from "./types.js";

/** Agent tokens over every model response in the run. */
export function tokensUsed(run: RunResult): number {
  return run.events.reduce(
    (total, event) =>
      event.type === "model.response"
        ? total + event.payload.usage.inputTokens + event.payload.usage.outputTokens
        : total,
    0,
  );
}

function latencyMs(run: RunResult): number {
  const first = run.events[0]?.timestamp;
  const last = run.events.at(-1)?.timestamp;
  return first && last ? Date.parse(last) - Date.parse(first) : 0;
}

/** Scripted runs make no model calls and their timing means nothing, so budgets wait for --live. */
export const budgetsCheck: EvalCheck = (expect, run, mode) => {
  if (mode === "scripted")
    return (["maxTokens", "maxLatencyMs"] as const)
      .filter((key) => expect[key] !== undefined)
      .map((key) => ({ skip: `Skipped in scripted mode: ${key} applies with --live.` }));

  const findings: CheckFinding[] = [];
  const tokens = tokensUsed(run);
  if (expect.maxTokens !== undefined && tokens > expect.maxTokens)
    findings.push({
      fail: `Used ${tokens} tokens, over ${expect.maxTokens} allowed by maxTokens.`,
    });
  const latency = latencyMs(run);
  if (expect.maxLatencyMs !== undefined && latency > expect.maxLatencyMs)
    findings.push({
      fail: `Took ${latency} ms, over ${expect.maxLatencyMs} allowed by maxLatencyMs.`,
    });
  return findings;
};
