import type { ReadinessReport } from "@plico/runtime";

export function formatReadinessReport(report: ReadinessReport): string[] {
  const lines: string[] = [];
  const subsystems = new Set(report.diagnostics.map((d) => d.subsystem));

  for (const sub of subsystems) {
    const items = report.diagnostics.filter((d) => d.subsystem === sub);
    const hasError = items.some((d) => d.severity === "error");
    const hasWarning = items.some((d) => d.severity === "warning");
    const symbol = hasError ? "✗" : hasWarning ? "!" : "✓";
    lines.push(`${symbol} ${sub}`);

    for (const item of items) {
      const prefix =
        item.severity === "error" ? "  ERROR" : item.severity === "warning" ? "  WARN " : "  OK   ";
      const pathInfo = item.path ? ` [${item.path}]` : "";
      lines.push(`${prefix}${pathInfo} ${item.message}`);
    }
  }

  lines.push(
    `\n${report.summary.ok} ok, ${report.summary.warning} warning(s), ${report.summary.error} error(s)`,
  );
  return lines;
}
