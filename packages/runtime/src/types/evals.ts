import type { EvalSummary, RunStatus } from "@plico-ai/contracts";
import type { EvalCaseExpect, EvalScorerRef } from "@plico-ai/core";
import type { ModelProvider } from "./provider.js";
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
  /** Fixed results for named tools in live runs. */
  mocks?: Record<string, unknown>;
  /** How many live runs the case gets. Defaults to 1. */
  trials?: number;
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
  /** A live run hit `maxTokens`, so some cases or trials never started. */
  tokenCapReached: boolean;
}

export interface LiveEvalOptions {
  provider: ModelProvider;
  providerRecoveryKey?: string;
  /** Take every tool result from the case's `.script.json` fixture; no handler runs. */
  mockTools?: boolean;
  /** Agent tokens over the whole suite. Once reached, no case or trial starts. */
  maxTokens?: number;
  /** Live runs at once. Defaults to 4. */
  concurrency?: number;
}

export interface RunEvalsOptions {
  eventStore?: EventStore;
  /** Run cases against the model instead of replaying their fixtures. */
  live?: LiveEvalOptions;
}
