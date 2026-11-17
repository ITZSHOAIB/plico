import type { RunStatus } from "./runs.js";

export interface EvalCaseResult {
  name: string;
  description?: string;
  status: "pass" | "fail";
  runId: string;
  runStatus: RunStatus;
  output?: string;
  diagnostics?: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}

export interface EvalReport extends EvalSummary {
  schemaVersion: 1;
  evaluatedAt: string;
  /** Identifies the fixtures this report ran, so readers can detect stale results. */
  fixturesDigest: string;
}

/** What the judge was asked and answered, enough to explain and repeat a judgement. */
export interface EvalJudgeRecord {
  /** The `provider:model` that was asked. */
  model: string;
  /** The model the provider says answered. */
  servedModel?: string;
  /** 0, or unset when the model refused it and answered at its default. */
  temperature?: number;
  prompt: string;
  /** The judge's answer as it came back. */
  raw: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** One scored check of a case: a judged criterion, rubric or factuality, or a code scorer. */
export interface EvalScore {
  kind: "criterion" | "rubric" | "factuality" | "scorer";
  /** The criterion text, the scorer's name, or `rubric` / `factuality`. */
  name: string;
  /** From 0 to 1. */
  score: number;
  threshold: number;
  passed: boolean;
  reason?: string;
  judge?: EvalJudgeRecord;
}

export interface EvalTrial extends EvalCaseResult {
  scores: EvalScore[];
  events: import("./events.js").PlicoEvent[];
  structuredOutput?: import("./events.js").JsonValue;
}

export interface SkippedEvalCase {
  name: string;
  reason: string;
  /** Completed trials retained when the case could not finish within the token cap. */
  completedTrials?: EvalTrial[];
}

/** Saved report files; the original /v1/eval routes retain their v1 shape. */
export interface EvalReportV2 extends EvalSummary {
  schemaVersion: 2;
  id: string;
  mode: "scripted" | "live";
  evaluatedAt: string;
  fixturesDigest: string;
  skipped: SkippedEvalCase[];
  tokenCapReached: boolean;
  results: (EvalCaseResult & { scores?: EvalScore[]; trials?: EvalTrial[]; passAtK?: number })[];
}
