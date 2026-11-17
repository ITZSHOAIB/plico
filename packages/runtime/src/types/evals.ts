import type { EvalCaseResult, EvalSummary, RunStatus } from "@plico-ai/contracts";
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
  /** The `provider:model` that judges this case's criteria and judged scorers. */
  judge?: string;
  /** Judge criteria from the case body, skipped in scripted mode. */
  criteria?: string[];
  scorers?: EvalScorerRef[];
}

import type { SkippedEvalCase } from "@plico-ai/contracts";

export type { EvalJudgeRecord, EvalScore, SkippedEvalCase } from "@plico-ai/contracts";
/** A case result with its scores. Scores and trials are saved in report files. */
export interface ScoredEvalCaseResult extends EvalCaseResult {
  scores?: import("@plico-ai/contracts").EvalScore[];
  trials?: import("@plico-ai/contracts").EvalTrial[];
  passAtK?: number;
}

/** What `runEvals` returns: the stored summary plus the cases it could not run. */
export interface EvalRunSummary extends EvalSummary {
  results: ScoredEvalCaseResult[];
  skipped: SkippedEvalCase[];
  /** A live run hit `maxTokens`, so some cases or trials never started. */
  tokenCapReached: boolean;
  reportId?: string;
}

export interface LiveEvalOptions {
  provider: ModelProvider;
  providerRecoveryKey?: string;
  /** Take every tool result from the case's `.script.json` fixture; no handler runs. */
  mockTools?: boolean;
  /**
   * The judge for a `provider:model`. Defaults to building it from `plico.config.ts`; endpoint
   * settings carry over from `model` when the provider matches.
   */
  judgeProvider?: (model: string) => ModelProvider;
  /**
   * Agent and judge tokens over the whole suite. No model call starts that is expected, at the
   * average call so far, to pass it; once one is refused, no case or trial starts.
   */
  maxTokens?: number;
  /** Live runs at once. Defaults to 4. */
  concurrency?: number;
}

export interface RunEvalsOptions {
  eventStore?: EventStore;
  /** Run cases against the model instead of replaying their fixtures. */
  live?: LiveEvalOptions;
}
