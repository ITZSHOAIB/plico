import { getProjectPaths } from "@plico-ai/core";
import { runProject } from "../run/index.js";
import type {
  EvalCase,
  EvalCaseResult,
  EvalRunSummary,
  RunEvalsOptions,
  RunResult,
} from "../types/index.js";
import { EVAL_CHECKS } from "./checks/index.js";
import { digestEvalFixtures, discoverEvalCases } from "./discover.js";
import { runScorers } from "./scorers.js";

export async function runEvals(
  projectRoot: string,
  options: RunEvalsOptions = {},
): Promise<EvalRunSummary> {
  const evalsDir = getProjectPaths(projectRoot).directories.evals;
  const cases = await discoverEvalCases(evalsDir);
  const fixturesDigest = await digestEvalFixtures(evalsDir);

  const results: EvalCaseResult[] = [];
  const skipped: EvalRunSummary["skipped"] = [];

  for (const evalCase of cases) {
    if (evalCase.script === undefined) {
      skipped.push({ name: evalCase.name, reason: "No .script.json fixture; runs with --live." });
      continue;
    }
    const runId = `eval-${evalCase.name.replace(/[^a-z0-9_-]/gi, "_")}-${crypto.randomUUID().slice(0, 8)}`;
    const runOpts: Record<string, unknown> = {
      script: evalCase.script,
      mockTools: true,
      runId,
    };
    if (options.eventStore !== undefined) runOpts.eventStore = options.eventStore;
    const result = await runProject(projectRoot, runOpts as Parameters<typeof runProject>[1]);
    results.push(await judgeCase(evalsDir, evalCase, result));
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;

  const summary = { total: results.length, passed, failed, results };
  await options.eventStore?.persistEvalReport({
    schemaVersion: 1,
    ...summary,
    evaluatedAt: new Date().toISOString(),
    fixturesDigest,
  });
  return { ...summary, skipped };
}

async function judgeCase(
  evalsDir: string,
  evalCase: EvalCase,
  result: RunResult,
): Promise<EvalCaseResult> {
  const expect = evalCase.expect ?? {};
  const findings = EVAL_CHECKS.flatMap((check) => check(expect, result));
  const failures = findings.flatMap((f) => ("fail" in f ? [f.fail] : []));
  const diagnostics = [...failures, ...findings.flatMap((f) => ("skip" in f ? [f.skip] : []))];

  const criteria = evalCase.criteria?.length ?? 0;
  if (criteria > 0)
    diagnostics.push(
      `Skipped in scripted mode: ${criteria} judge ${criteria === 1 ? "criterion runs" : "criteria run"} with --live.`,
    );

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
  return entry;
}
