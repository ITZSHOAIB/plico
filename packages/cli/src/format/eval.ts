import type { EvalRunSummary } from "@plico-ai/runtime";

export function formatEvalSummary(target: string, summary: EvalRunSummary): string[] {
  const lines = [`Eval results for ${target}`];

  if (summary.total === 0 && summary.skipped.length === 0) {
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
  for (const skipped of summary.skipped) lines.push(`  SKIP ${skipped.name}: ${skipped.reason}`);

  const skipped = summary.skipped.length ? `, ${summary.skipped.length} skipped` : "";
  lines.push(`\n${summary.passed}/${summary.total} passed, ${summary.failed} failed${skipped}`);
  return lines;
}
