import type { LoadedProject } from "@plico-ai/core";
import { getProjectPaths } from "@plico-ai/core";
import { discoverEvalCases } from "../../evals/discover.js";
import { isJudgedScorer } from "../../evals/judge/checks.js";
import { configuredJudge, modelFromRef } from "../../evals/judge/models.js";
import { resolveModelEndpoint } from "../../providers/registry.js";
import type { EvalCase, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

/** The judge models a case's criteria and judged scorers would use; undefined where none is set. */
function judgesOf(evalCase: EvalCase, suiteJudge: string | undefined): Array<string | undefined> {
  const fallback = evalCase.judge ?? suiteJudge;
  return [
    ...(evalCase.criteria?.length ? [fallback] : []),
    ...(evalCase.scorers ?? []).filter(isJudgedScorer).map((ref) => ref.judge ?? fallback),
  ];
}

/** Judged evals need a judge model with credentials, and one other than the agent's own. */
export async function checkEvalJudge(project: LoadedProject): Promise<ReadinessDiagnostic[]> {
  let cases: EvalCase[];
  try {
    cases = await discoverEvalCases(getProjectPaths(project.root).directories.evals);
  } catch {
    return []; // The evals check reports cases that cannot be read.
  }
  const { config } = project;
  const judges = cases.flatMap((evalCase) => judgesOf(evalCase, configuredJudge(config)));
  if (judges.length === 0) return [];

  const diagnostics: ReadinessDiagnostic[] = [];
  if (judges.includes(undefined))
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "evals.judge",
        "Some eval cases have judged checks but no judge model. Set evals.judge in plico.config.ts.",
        "plico.config.ts",
      ),
    );
  const agentModel = config.model && `${config.model.provider}:${config.model.name}`;
  for (const ref of new Set(judges.filter((judge) => judge !== undefined))) {
    const model = modelFromRef(ref, config.model);
    const { apiKeyEnv } = model ? resolveModelEndpoint(model) : {};
    if (apiKeyEnv && !process.env[apiKeyEnv])
      diagnostics.push(
        makeDiagnostic("warning", "evals.judge", `Set ${apiKeyEnv} to run the judge ${ref}.`),
      );
    if (ref === agentModel)
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "evals.judge",
          `The judge ${ref} is the agent's own model, so it grades its own answers. Set evals.judge to another model.`,
          "plico.config.ts",
        ),
      );
  }
  return diagnostics.length > 0
    ? diagnostics
    : [makeDiagnostic("ok", "evals.judge", "Judged eval checks have a judge model.")];
}
