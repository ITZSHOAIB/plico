import { join } from "node:path";
import { runProject } from "../run/index.js";
import type { EvalCaseResult, EvalSummary, RunEvalsOptions } from "../types/index.js";
import { discoverEvalCases } from "./discover.js";

export async function runEvals(
  projectRoot: string,
  options: RunEvalsOptions = {},
): Promise<EvalSummary> {
  const evalsDir = join(projectRoot, "evals");
  const cases = await discoverEvalCases(evalsDir);

  const results: EvalCaseResult[] = [];

  for (const evalCase of cases) {
    const runId = `eval-${evalCase.name.replace(/[^a-z0-9_-]/gi, "_")}-${crypto.randomUUID().slice(0, 8)}`;
    const runOpts: Record<string, unknown> = {
      script: evalCase.script,
      runId,
    };
    if (options.eventStore !== undefined) runOpts.eventStore = options.eventStore;
    const result = await runProject(projectRoot, runOpts as Parameters<typeof runProject>[1]);

    const diagnostics: string[] = [];
    let passed = true;

    if (evalCase.expect?.status && result.status !== evalCase.expect.status) {
      passed = false;
      diagnostics.push(`Expected status "${evalCase.expect.status}" but got "${result.status}"`);
    }

    if (evalCase.expect?.outputContains) {
      const output = result.output ?? "";
      if (!output.includes(evalCase.expect.outputContains)) {
        passed = false;
        diagnostics.push(
          `Expected output to contain "${evalCase.expect.outputContains}" but got "${output}"`,
        );
      }
    }

    if (result.errors?.length) {
      for (const err of result.errors) {
        diagnostics.push(`${err.path}: ${err.message}`);
      }
    }

    const entry: Record<string, unknown> = {
      name: evalCase.name,
      status: passed ? "pass" : "fail",
      runId: result.runId,
      runStatus: result.status,
    };
    if (evalCase.description !== undefined) entry.description = evalCase.description;
    if (result.output !== undefined) entry.output = result.output;
    if (diagnostics.length > 0) entry.diagnostics = diagnostics;
    results.push(entry as unknown as EvalCaseResult);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
