import { join } from "node:path";
import type { ScoreResult, ScorerDefinition, ScorerInput } from "@plico-ai/contracts";
import type { EvalCodeScorerRef } from "@plico-ai/core";
import { isRecord } from "../guards.js";
import { importProjectModule } from "../tools/load.js";
import type { EvalScore } from "../types/index.js";

/** Runs a case's custom scorers: a score for each one, and a failure for each below its threshold. */
export async function runScorers(
  evalsDir: string,
  refs: EvalCodeScorerRef[],
  input: ScorerInput,
): Promise<{ scores: EvalScore[]; failures: string[] }> {
  const scores: EvalScore[] = [];
  const failures: string[] = [];
  for (const { use, threshold = 1 } of refs) {
    let result: ScoreResult;
    try {
      const scorer = await loadScorer(join(evalsDir, "scorers", `${use}.ts`), use);
      result = await scorer.score(input);
      // `NaN` fails no comparison, so it must be refused here or it would pass any threshold.
      if (!Number.isFinite(result?.score) || result.score < 0 || result.score > 1)
        throw new Error("it must return { score } from 0 to 1");
    } catch (error) {
      failures.push(
        `Scorer "${use}" threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const passed = result.score >= threshold;
    scores.push({
      kind: "scorer",
      name: use,
      score: result.score,
      threshold,
      passed,
      ...(result.reason ? { reason: result.reason } : {}),
    });
    if (!passed)
      failures.push(
        `Scorer "${use}" scored ${result.score}, below ${threshold}${result.reason ? `: ${result.reason}` : ""}`,
      );
  }
  return { scores, failures };
}

async function loadScorer(path: string, use: string): Promise<ScorerDefinition> {
  const module = await importProjectModule(path, "scorers");
  const scorer = isRecord(module) ? module.default : undefined;
  if (!isRecord(scorer) || typeof scorer.score !== "function")
    throw new Error(`evals/scorers/${use}.ts must default export defineScorer({ name, score }).`);
  return scorer as unknown as ScorerDefinition;
}
