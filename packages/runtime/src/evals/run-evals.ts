import type { JsonValue } from "@plico-ai/contracts";
import { getProjectPaths } from "@plico-ai/core";
import { runProject } from "../run/index.js";
import type { EvalRunSummary, RunEvalsOptions, ScoredEvalCaseResult } from "../types/index.js";
import { digestEvalFixtures, discoverEvalCases } from "./discover.js";
import { judgeRun } from "./judge-case.js";
import { runLiveEvals } from "./live.js";
import { saveEvalReport } from "./reports.js";

/**
 * Runs cases in `evals/` and saves a report file with scores and trial transcripts.
 * Scripted runs also retain the legacy summary in the event store.
 */
export async function runEvals(
  projectRoot: string,
  options: RunEvalsOptions = {},
): Promise<EvalRunSummary> {
  const evalsDir = getProjectPaths(projectRoot).directories.evals;
  const cases = await discoverEvalCases(evalsDir);
  if (options.live) {
    const summary = await runLiveEvals(
      projectRoot,
      evalsDir,
      cases,
      options.live,
      options.eventStore,
    );
    const report = await saveEvalReport(projectRoot, "live", summary);
    return { ...summary, reportId: report.id };
  }

  const fixturesDigest = await digestEvalFixtures(evalsDir);
  const results: ScoredEvalCaseResult[] = [];
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
      ...(evalCase.agent === undefined ? {} : { agent: evalCase.agent }),
      ...(evalCase.workflow === undefined
        ? {}
        : { workflow: evalCase.workflow, input: evalCase.input as JsonValue }),
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
    // Stored reports gain scores in v2.
    results: results.map(
      ({ scores: _scores, trials: _trials, passAtK: _pass, ...result }) => result,
    ),
    evaluatedAt: new Date().toISOString(),
    fixturesDigest,
  });
  const result = { ...summary, skipped, tokenCapReached: false };
  const report = await saveEvalReport(projectRoot, "scripted", result);
  return { ...result, reportId: report.id };
}
