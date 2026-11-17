import type { EvalCase, EvalCaseResult, RunResult } from "../types/index.js";
import { EVAL_CHECKS, type EvalMode } from "./checks/index.js";
import { runScorers } from "./scorers.js";

export interface JudgedRun {
  entry: EvalCaseResult;
  /** The diagnostics that failed the run; the rest of `entry.diagnostics` are notes. */
  failures: string[];
}

function criteriaNote(count: number, mode: EvalMode): string {
  const subject = `${count} judge ${count === 1 ? "criterion" : "criteria"}`;
  return mode === "scripted"
    ? `Skipped in scripted mode: ${subject} ${count === 1 ? "runs" : "run"} with --live.`
    : `Skipped: ${subject}; the judge is not available yet.`;
}

/** Runs the case's `expect` checks and scorers over one run. */
export async function judgeRun(
  evalsDir: string,
  evalCase: EvalCase,
  result: RunResult,
  mode: EvalMode,
): Promise<JudgedRun> {
  const expect = evalCase.expect ?? {};
  const findings = EVAL_CHECKS.flatMap((check) => check(expect, result, mode));
  const failures = findings.flatMap((f) => ("fail" in f ? [f.fail] : []));
  const diagnostics = [...failures, ...findings.flatMap((f) => ("skip" in f ? [f.skip] : []))];

  const criteria = evalCase.criteria?.length ?? 0;
  if (criteria > 0) diagnostics.push(criteriaNote(criteria, mode));

  const scorerFailures = await runScorers(evalsDir, evalCase.scorers ?? [], {
    ...(evalCase.input === undefined ? {} : { input: evalCase.input }),
    output: result.output ?? "",
    ...(result.structuredOutput === undefined ? {} : { structuredOutput: result.structuredOutput }),
    expected: expect as Record<string, unknown>,
    status: result.status,
    events: result.events,
  });
  failures.push(...scorerFailures);
  diagnostics.push(...scorerFailures);

  for (const event of result.events) {
    if (event.type === "run.error" && typeof event.payload.message === "string")
      diagnostics.push(event.payload.message);
  }
  for (const err of result.errors ?? []) diagnostics.push(`${err.path}: ${err.message}`);

  const entry: EvalCaseResult = {
    name: evalCase.name,
    status: failures.length === 0 ? "pass" : "fail",
    runId: result.runId,
    runStatus: result.status,
  };
  if (evalCase.description !== undefined) entry.description = evalCase.description;
  if (result.output !== undefined) entry.output = result.output;
  if (diagnostics.length > 0) entry.diagnostics = diagnostics;
  return { entry, failures };
}

/**
 * One result for a case's trials. It passes only when every trial passes; the run shown is the
 * first failing trial, else the last.
 */
export function combineTrials(trials: JudgedRun[]): EvalCaseResult {
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
