import type { EvalCodeScorerRef, EvalScorerRef } from "@plico-ai/core";
import type { EvalCase, EvalScore, ModelProvider, RunResult } from "../../types/index.js";
import { askJudge } from "./ask.js";
import { criterionPrompt, factualityPrompt, type JudgePrompt, rubricPrompt } from "./prompts.js";
import { describeInput, describeOutput, describeSubmission } from "./submission.js";

/** The judges a live run is graded by. */
export interface RunJudge {
  /** The case's `judge:`, else `evals.judge`, else the configured model. */
  defaultModel?: string;
  provider(model: string): ModelProvider;
}

export const RUBRIC_THRESHOLD = 0.7;
export const FACTUALITY_THRESHOLD = 0.6;

interface JudgedCheck {
  score: Pick<EvalScore, "kind" | "name" | "threshold">;
  /** How failures and errors name the check. */
  label: string;
  model: string | undefined;
  prompt: JudgePrompt;
  failure(score: number, choice: string, reasons: string): string;
}

const shown = (score: number) => Number(score.toFixed(2));
const because = (reasons: string) => (reasons ? `: ${reasons}` : ".");

type JudgedScorerRef = Exclude<EvalScorerRef, EvalCodeScorerRef>;

export const isJudgedScorer = (ref: EvalScorerRef): ref is JudgedScorerRef => !("use" in ref);

function plan(evalCase: EvalCase, run: RunResult, judge: RunJudge): JudgedCheck[] {
  const task = describeInput(evalCase.input);
  const submission = describeSubmission(run);
  const checks: JudgedCheck[] = (evalCase.criteria ?? []).map((criterion) => ({
    score: { kind: "criterion", name: criterion, threshold: 1 },
    label: `criterion "${criterion}"`,
    model: judge.defaultModel,
    prompt: criterionPrompt(task, submission, criterion),
    failure: (_score, _choice, reasons) => `Criterion "${criterion}" not met${because(reasons)}`,
  }));
  for (const ref of (evalCase.scorers ?? []).filter(isJudgedScorer)) {
    const model = ref.judge ?? judge.defaultModel;
    if ("rubric" in ref) {
      const threshold = ref.threshold ?? RUBRIC_THRESHOLD;
      const top = ref.rubric.length - 1;
      checks.push({
        score: { kind: "rubric", name: "rubric", threshold },
        label: "the rubric",
        model,
        prompt: rubricPrompt(task, submission, ref.rubric),
        failure: (score, choice, reasons) =>
          `Rubric scored ${shown(score)} (level ${choice} of ${top}), below ${threshold}${because(reasons)}`,
      });
    } else {
      const threshold = ref.threshold ?? FACTUALITY_THRESHOLD;
      checks.push({
        score: { kind: "factuality", name: "factuality", threshold },
        label: "factuality",
        model,
        prompt: factualityPrompt(task, ref.factuality, describeOutput(run)),
        failure: (score, choice, reasons) =>
          `Factuality scored ${shown(score)} (${choice}), below ${threshold}${because(reasons)}`,
      });
    }
  }
  return checks;
}

/**
 * Grades a live run on the case's criteria, rubric and factuality, one judge call each, in order.
 * A judge that cannot be reached or answers off its choices fails that check.
 */
export async function runJudgedChecks(
  evalCase: EvalCase,
  run: RunResult,
  judge: RunJudge,
): Promise<{ scores: EvalScore[]; failures: string[] }> {
  const scores: EvalScore[] = [];
  const failures: string[] = [];
  for (const check of plan(evalCase, run, judge)) {
    if (check.model === undefined) {
      failures.push(
        `No judge for ${check.label}: set evals.judge or model in plico.config.ts, or judge: in the case.`,
      );
      continue;
    }
    try {
      const answer = await askJudge(judge.provider(check.model), check.model, check.prompt);
      const passed = answer.score >= check.score.threshold;
      scores.push({
        ...check.score,
        score: answer.score,
        passed,
        ...(answer.reasons ? { reason: answer.reasons } : {}),
        judge: answer.record,
      });
      if (!passed) failures.push(check.failure(answer.score, answer.choice, answer.reasons));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Judge ${check.model} could not grade ${check.label}: ${message}`);
    }
  }
  return { scores, failures };
}
