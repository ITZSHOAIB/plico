import { join } from "node:path";
import type { EvalReportV2 } from "@plico-ai/contracts";
import { loadProject } from "@plico-ai/core";
import type { EvalRunSummary, LiveEvalOptions } from "../types/index.js";
import { discoverEvalCases } from "./discover.js";
import { configuredJudge, configuredJudgeProviders } from "./judge/models.js";
import { combineTrials, judgeRun } from "./judge-case.js";
import { saveEvalReport } from "./reports.js";

/** Grades saved transcripts using current expectations, without running the agent or tools. */
export async function rescoreEvalReport(
  root: string,
  report: EvalReportV2,
  judgeProvider?: LiveEvalOptions["judgeProvider"],
): Promise<EvalReportV2> {
  const dir = join(root, "evals");
  const cases = await discoverEvalCases(dir);
  const project = await loadProject(root);
  const provider = judgeProvider ?? configuredJudgeProviders(project.config, root);
  const results: EvalRunSummary["results"] = [];
  for (const saved of report.results) {
    const definition = cases.find((item) => item.name === saved.name);
    if (!definition) throw new Error(`Eval case ${saved.name} no longer exists.`);
    if (!saved.trials?.length) throw new Error(`No saved transcripts for ${saved.name}.`);
    const trials = [];
    for (const trial of saved.trials) {
      const defaultModel = definition.judge ?? configuredJudge(project.config);
      trials.push(
        await judgeRun(
          dir,
          definition,
          {
            runId: trial.runId,
            status: trial.runStatus,
            events: trial.events,
            ...(trial.output === undefined ? {} : { output: trial.output }),
            ...(trial.structuredOutput === undefined
              ? {}
              : { structuredOutput: trial.structuredOutput }),
          },
          report.mode,
          report.mode === "live"
            ? { provider, ...(defaultModel === undefined ? {} : { defaultModel }) }
            : undefined,
        ),
      );
    }
    results.push(combineTrials(trials));
  }
  return saveEvalReport(root, report.mode, {
    results,
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: report.skipped,
    tokenCapReached: report.tokenCapReached,
  });
}
