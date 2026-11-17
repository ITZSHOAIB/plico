import { join } from "node:path";
import type { ScoreResult, ScorerDefinition, ScorerInput } from "@plico-ai/contracts";
import type { EvalScorerRef } from "@plico-ai/core";
import { isRecord } from "../guards.js";
import { importProjectModule } from "../tools/load.js";

/** Runs a case's custom scorers and returns a failure message for each one below its threshold. */
export async function runScorers(
  evalsDir: string,
  refs: EvalScorerRef[],
  input: ScorerInput,
): Promise<string[]> {
  const failures: string[] = [];
  for (const { use, threshold = 1 } of refs) {
    let result: ScoreResult;
    try {
      const scorer = await loadScorer(join(evalsDir, "scorers", `${use}.ts`), use);
      result = await scorer.score(input);
      if (typeof result?.score !== "number" || result.score < 0 || result.score > 1)
        throw new Error("it must return { score } from 0 to 1");
    } catch (error) {
      failures.push(
        `Scorer "${use}" threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (result.score < threshold)
      failures.push(
        `Scorer "${use}" scored ${result.score}, below ${threshold}${result.reason ? `: ${result.reason}` : ""}`,
      );
  }
  return failures;
}

async function loadScorer(path: string, use: string): Promise<ScorerDefinition> {
  const module = await importProjectModule(path, "scorers");
  const scorer = isRecord(module) ? module.default : undefined;
  if (!isRecord(scorer) || typeof scorer.score !== "function")
    throw new Error(`evals/scorers/${use}.ts must default export defineScorer({ name, score }).`);
  return scorer as unknown as ScorerDefinition;
}
