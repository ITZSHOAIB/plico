import type { EvalSummary } from "@plico/runtime";

export function formatEvalSummary(target: string, summary: EvalSummary): string[] {
  const lines = [`Eval results for ${target}`];

  if (summary.total === 0) {
    lines.push("No eval cases found.");
    return lines;
  }

  for (const result of summary.results) {
    const statusSymbol = result.status === "pass" ? "PASS" : "FAIL";
    lines.push(`  ${statusSymbol} ${result.name} (${result.runId})`);

    if (result.diagnostics?.length) {
      for (const diag of result.diagnostics) {
        lines.push(`       ${diag}`);
      }
    }
  }

  lines.push(`\n${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  return lines;
}
