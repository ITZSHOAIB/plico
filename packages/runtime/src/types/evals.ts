import type { EvalSummary, RunStatus } from "@plico-ai/contracts";
import type { EvalCaseExpect, EvalScorerRef } from "@plico-ai/core";
import type { DryRunScriptStep } from "./script.js";
import type { EventStore } from "./store.js";

export interface EvalExpectation extends EvalCaseExpect {
  status?: RunStatus;
  /** The `*.script.json` spelling of `contains`. */
  outputContains?: string;
}

export interface EvalCase {
  name: string;
  description?: string;
  /** The steps scripted mode replays. Undefined for a Markdown case without a fixture. */
  script?: DryRunScriptStep[];
  expect?: EvalExpectation;
  input?: unknown;
  /** Judge criteria from the case body, skipped in scripted mode. */
  criteria?: string[];
  scorers?: EvalScorerRef[];
}

export interface SkippedEvalCase {
  name: string;
  reason: string;
}

/** What `runEvals` returns: the stored summary plus the cases it could not run. */
export interface EvalRunSummary extends EvalSummary {
  skipped: SkippedEvalCase[];
}

export interface RunEvalsOptions {
  eventStore?: EventStore;
}
