import type { JsonValue, PlicoEvent } from "./events.js";
import type { RunStatus } from "./runs.js";

/** What a scorer sees: the whole run of one eval case. */
export interface ScorerInput {
  /** The case's `input`, when it has one. */
  input?: unknown;
  /** The agent's final text output. */
  output: string;
  /** The validated final value, when the agent declares an output schema. */
  structuredOutput?: JsonValue;
  /** The case's `expect` block. */
  expected: Record<string, unknown>;
  status: RunStatus;
  /** Every event of the run: tool calls, artifacts, usage and timing. */
  events: PlicoEvent[];
}

export interface ScoreResult {
  /** From 0 to 1. */
  score: number;
  reason?: string;
  metadata?: Record<string, JsonValue>;
}

/** A custom scorer, default exported from `evals/scorers/<name>.ts`. */
export interface ScorerDefinition {
  name: string;
  score(input: ScorerInput): ScoreResult | Promise<ScoreResult>;
}
