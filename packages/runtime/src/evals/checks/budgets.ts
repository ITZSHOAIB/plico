import type { EvalCheck } from "./types.js";

/** Scripted runs make no model calls and their timing means nothing, so budgets wait for --live. */
export const budgetsCheck: EvalCheck = (expect) =>
  (["maxTokens", "maxLatencyMs"] as const)
    .filter((key) => expect[key] !== undefined)
    .map((key) => ({ skip: `Skipped in scripted mode: ${key} applies with --live.` }));
