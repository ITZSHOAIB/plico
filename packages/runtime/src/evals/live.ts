import {
  getProjectRelativePaths,
  type LoadedProject,
  loadProject,
  prepareRunMessage,
  readRunSchemas,
} from "@plico-ai/core";
import { runProject } from "../run/index.js";
import type {
  EvalCase,
  EvalRunSummary,
  EventStore,
  LiveEvalOptions,
  ModelProvider,
  ScoredEvalCaseResult,
  SkippedEvalCase,
} from "../types/index.js";
import { configuredJudge, configuredJudgeProviders, modelFromRef } from "./judge/models.js";
import { combineTrials, type JudgedRun, judgeRun } from "./judge-case.js";
import { liveToolResults } from "./live-tools.js";
import { runPool } from "./pool.js";
import { createTokenBudget } from "./token-budget.js";

interface PlannedCase {
  evalCase: EvalCase;
  message: string;
  trials: number;
}

/** The message each case sends, or why it cannot run live. */
async function planCases(
  project: LoadedProject,
  cases: EvalCase[],
): Promise<{ planned: PlannedCase[]; skipped: SkippedEvalCase[] }> {
  const projectRoot = project.root;
  const hasInputSchema = (await readRunSchemas(project)).input !== undefined;
  const planned: PlannedCase[] = [];
  const skipped: SkippedEvalCase[] = [];
  for (const evalCase of cases) {
    const { input } = evalCase;
    if (input === undefined) {
      skipped.push({ name: evalCase.name, reason: "Has no input, so it cannot run with --live." });
      continue;
    }
    const prepared = await prepareRunMessage(
      projectRoot,
      typeof input === "string" && !hasInputSchema ? { content: input } : { input },
    );
    if (!prepared.ok || prepared.message === undefined) {
      const path = `${getProjectRelativePaths().directories.evals}/${evalCase.name}.md`;
      const reason = prepared.ok ? "input is empty" : prepared.errors.join("; ");
      throw new Error(`Invalid eval case ${path}: ${reason}`);
    }
    planned.push({ evalCase, message: prepared.message, trials: evalCase.trials ?? 1 });
  }
  return { planned, skipped };
}

/** Runs each case's trials against the model, within the concurrency and token cap. */
export async function runLiveEvals(
  projectRoot: string,
  evalsDir: string,
  cases: EvalCase[],
  live: LiveEvalOptions,
  eventStore: EventStore | undefined,
): Promise<EvalRunSummary> {
  const project = await loadProject(projectRoot);
  const { planned, skipped: unplanned } = await planCases(project, cases);
  const budget = live.maxTokens === undefined ? undefined : createTokenBudget(live.maxTokens);
  const judgeProvider = live.judgeProvider ?? configuredJudgeProviders(project.config, projectRoot);
  const suiteJudge = configuredJudge(project.config);

  const runs = planned.flatMap(({ evalCase, message, trials }) =>
    Array.from({ length: trials }, () => async (): Promise<JudgedRun | undefined> => {
      const mockToolResult = liveToolResults(evalCase, live.mockTools === true);
      let refused = false;
      const metered = (provider: ModelProvider) =>
        budget
          ? budget.meter(provider, () => {
              refused = true;
            })
          : provider;
      const result = await runProject(projectRoot, {
        message,
        provider: metered(live.provider),
        runId: `eval-${evalCase.name.replace(/[^a-z0-9_-]/gi, "_")}-${crypto.randomUUID().slice(0, 8)}`,
        ...(live.providerRecoveryKey === undefined
          ? {}
          : { providerRecoveryKey: live.providerRecoveryKey }),
        ...(mockToolResult === undefined ? {} : { mockToolResult }),
        ...(eventStore === undefined ? {} : { eventStore }),
      });
      // A run or judge call the cap cut off leaves the trial ungraded; its case is listed as skipped.
      if (refused) return undefined;
      const defaultModel = evalCase.judge ?? suiteJudge;
      const judged = await judgeRun(evalsDir, evalCase, result, "live", {
        ...(defaultModel === undefined ? {} : { defaultModel }),
        provider: (model) => metered(judgeProvider(model)),
        retries: (model) => modelFromRef(model, project.config.model) ?? {},
      });
      return refused ? undefined : judged;
    }),
  );
  const finished = await runPool(runs, live.concurrency ?? 4, () => !budget?.exhausted);

  const results: ScoredEvalCaseResult[] = [];
  const skipped = [...unplanned];
  let offset = 0;
  for (const { evalCase, trials } of planned) {
    const done = finished.slice(offset, offset + trials).filter((run) => run !== undefined);
    offset += trials;
    if (done.length === trials) results.push(combineTrials(done));
    else
      skipped.push({
        name: evalCase.name,
        reason:
          done.length === 0
            ? `Token cap of ${live.maxTokens} reached.`
            : `Token cap of ${live.maxTokens} reached after ${done.length} of ${trials} trials.`,
      });
  }
  skipped.sort((a, b) => a.name.localeCompare(b.name));

  return {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    results,
    skipped,
    tokenCapReached: finished.some((run) => run === undefined),
  };
}
