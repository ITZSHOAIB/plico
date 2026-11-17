import { getProjectPaths } from "@plico-ai/core";
import { runProject } from "../run/index.js";
import type { EvalCaseResult, EvalRunSummary, RunEvalsOptions } from "../types/index.js";
import { digestEvalFixtures, discoverEvalCases } from "./discover.js";
import { judgeRun } from "./judge-case.js";
import { runLiveEvals } from "./live.js";

/**
 * Runs the cases in `evals/`. Scripted runs replay each case's fixture and store the report; live
 * runs (`options.live`) call the model and are not stored until reports carry their mode.
 */
export async function runEvals(
  projectRoot: string,
  options: RunEvalsOptions = {},
): Promise<EvalRunSummary> {
  const evalsDir = getProjectPaths(projectRoot).directories.evals;
  const cases = await discoverEvalCases(evalsDir);
  if (options.live)
    return runLiveEvals(projectRoot, evalsDir, cases, options.live, options.eventStore);

  const fixturesDigest = await digestEvalFixtures(evalsDir);
  const results: EvalCaseResult[] = [];
  const skipped: EvalRunSummary["skipped"] = [];

  for (const evalCase of cases) {
    if (evalCase.script === undefined) {
      skipped.push({ name: evalCase.name, reason: "No .script.json fixture; runs with --live." });
      continue;
    }
    const runId = `eval-${evalCase.name.replace(/[^a-z0-9_-]/gi, "_")}-${crypto.randomUUID().slice(0, 8)}`;
    const result = await runProject(projectRoot, {
      script: evalCase.script,
      mockTools: true,
      runId,
      ...(options.eventStore === undefined ? {} : { eventStore: options.eventStore }),
    });
    results.push((await judgeRun(evalsDir, evalCase, result, "scripted")).entry);
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
  return { ...summary, skipped, tokenCapReached: false };
}
