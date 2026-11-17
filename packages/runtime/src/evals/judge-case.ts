import type { EvalCodeScorerRef } from "@plico-ai/core";
import type { EvalCase, EvalScore, RunResult, ScoredEvalCaseResult } from "../types/index.js";
import { EVAL_CHECKS, type EvalMode } from "./checks/index.js";
import { isJudgedScorer, type RunJudge, runJudgedChecks } from "./judge/checks.js";
import { runScorers } from "./scorers.js";

export interface JudgedRun {
  entry: ScoredEvalCaseResult;
  /** The diagnostics that failed the run; the rest of `entry.diagnostics` are notes. */
  failures: string[];
}

function scriptedNote(count: number, one: string, many: string): string[] {
  if (count === 0) return [];
  const subject = `${count} ${count === 1 ? one : many}`;
  return [`Skipped in scripted mode: ${subject} ${count === 1 ? "runs" : "run"} with --live.`];
}

/**
 * Runs the case's `expect` checks and scorers over one run. Live runs are also graded by `judge`;
 * scripted runs note the judged checks they skip.
 */
export async function judgeRun(
  evalsDir: string,
  evalCase: EvalCase,
  result: RunResult,
  mode: EvalMode,
  judge?: RunJudge,
): Promise<JudgedRun> {
  const expect = evalCase.expect ?? {};
  const findings = EVAL_CHECKS.flatMap((check) => check(expect, result, mode));
  const failures = findings.flatMap((f) => ("fail" in f ? [f.fail] : []));
  const notes = findings.flatMap((f) => ("skip" in f ? [f.skip] : []));
  const scores: EvalScore[] = [];

  const refs = evalCase.scorers ?? [];
  const judged = refs.filter(isJudgedScorer);
  const judgedCount = (evalCase.criteria?.length ?? 0) + judged.length;
  if (judge && result.status === "failed" && judgedCount > 0) {
    // A failed run has nothing to grade, so the judge is not paid to say so.
    notes.push(
      `Skipped ${judgedCount} judged ${judgedCount === 1 ? "check" : "checks"}: the run failed.`,
    );
  } else if (judge) {
    const graded = await runJudgedChecks(evalCase, result, judge);
    scores.push(...graded.scores);
    failures.push(...graded.failures);
  } else {
    notes.push(
      ...scriptedNote(evalCase.criteria?.length ?? 0, "judge criterion", "judge criteria"),
      ...scriptedNote(judged.length, "judged scorer", "judged scorers"),
    );
  }

  const scored = await runScorers(
    evalsDir,
    refs.filter((ref): ref is EvalCodeScorerRef => "use" in ref),
    {
      ...(evalCase.input === undefined ? {} : { input: evalCase.input }),
      output: result.output ?? "",
      ...(result.structuredOutput === undefined
        ? {}
        : { structuredOutput: result.structuredOutput }),
      expected: expect as Record<string, unknown>,
      status: result.status,
      events: result.events,
    },
  );
  scores.push(...scored.scores);
  failures.push(...scored.failures);

  const diagnostics = [...failures, ...notes];
  for (const event of result.events) {
    if (event.type === "run.error" && typeof event.payload.message === "string")
      diagnostics.push(event.payload.message);
  }
  for (const err of result.errors ?? []) diagnostics.push(`${err.path}: ${err.message}`);

  const entry: ScoredEvalCaseResult = {
    name: evalCase.name,
    status: failures.length === 0 ? "pass" : "fail",
    runId: result.runId,
    runStatus: result.status,
  };
  if (evalCase.description !== undefined) entry.description = evalCase.description;
  if (result.output !== undefined) entry.output = result.output;
  if (diagnostics.length > 0) entry.diagnostics = diagnostics;
  if (scores.length > 0) entry.scores = scores;
  entry.trials = [
    {
      ...entry,
      scores,
      events: result.events,
      ...(result.structuredOutput === undefined
        ? {}
        : { structuredOutput: result.structuredOutput }),
    },
  ];
  entry.passAtK = failures.length === 0 ? 1 : 0;
  return { entry, failures };
}

/**
 * One result for a case's trials. It passes only when every trial passes; the run shown is the
 * first failing trial, else the last.
 */
export function combineTrials(trials: JudgedRun[]): ScoredEvalCaseResult {
  const [only] = trials;
  if (trials.length === 1 && only) return only.entry;

  const failing = trials.flatMap((trial, index) =>
    trial.failures.length > 0 ? [{ trial, number: index + 1 }] : [],
  );
  const shown = failing[0]?.trial ?? trials.at(-1);
  if (!shown) throw new Error("A case ran no trials.");
  const notes = (shown.entry.diagnostics ?? []).filter((d) => !shown.failures.includes(d));
  return {
    ...shown.entry,
    trials: trials.flatMap((trial) => trial.entry.trials ?? []),
    passAtK: failing.length < trials.length ? 1 : 0,
    status: failing.length === 0 ? "pass" : "fail",
    diagnostics: [
      `${trials.length - failing.length}/${trials.length} trials passed.`,
      ...failing.flatMap(({ trial, number }) =>
        trial.failures.map((failure) => `Trial ${number}/${trials.length}: ${failure}`),
      ),
      ...notes,
    ],
  };
}
