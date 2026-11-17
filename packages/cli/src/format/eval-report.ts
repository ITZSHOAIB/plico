import type { EvalReportV2 } from "@plico-ai/runtime";

const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const cell = (s: string) => s.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
export function formatEvalReport(report: EvalReportV2, format: string): string {
  if (format === "junit")
    return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="plico" tests="${report.total + report.skipped.length}" failures="${report.failed}" skipped="${report.skipped.length}">${report.results.map((r) => `<testcase name="${xml(r.name)}">${r.status === "fail" ? `<failure message="Eval failed">${xml((r.diagnostics ?? []).join("\n"))}</failure>` : ""}</testcase>`).join("")}${report.skipped.map((r) => `<testcase name="${xml(r.name)}"><skipped message="${xml(r.reason)}"/></testcase>`).join("")}</testsuite>`;
  if (format === "markdown")
    return `| Case | Result | Scores |\n| --- | --- | --- |\n${report.results.map((r) => `| ${cell(r.name)} | ${r.status} | ${cell((r.scores ?? []).map((s) => `${s.name}: ${s.score} ${s.reason ?? ""}`).join("; "))} |`).join("\n")}\n${report.passed}/${report.total} passed; ${report.skipped.length} skipped.`;
  throw new Error(`Unknown eval format: ${format}. Use markdown or junit.`);
}
