import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareEvalReports, readEvalReport, rescoreEvalReport } from "@plico-ai/runtime";
import { parseArgs, readStringOption } from "../args.js";
import { formatEvalReport } from "../format/eval-report.js";

function formatComparison(comparison: ReturnType<typeof compareEvalReports>): string {
  return [
    ...comparison.warnings,
    ...comparison.cases.map(
      (r) =>
        `${r.regressed ? "REGRESSION" : "OK"} ${r.name}: ${r.before} -> ${r.after} ${r.deltas.map((d) => `${d.name} ${d.delta ?? "missing"}`).join(", ")}`,
    ),
  ].join("\n");
}

export async function reportCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  const parsed = parseArgs(rest, {
    flags: ["--json"],
    values: {
      "--tolerance": { missing: "Missing tolerance" },
      "--format": { missing: "Missing format" },
    },
    rejectUnknown: true,
  });
  const [first, second] = parsed.positionals;
  if (!first)
    throw new Error(
      `Usage: plico eval ${command} <report>${command === "compare" ? " <report>" : " [project]"}`,
    );
  if (command === "compare") {
    if (!second) throw new Error("compare requires two report files.");
    const comparison = compareEvalReports(
      await readEvalReport(first),
      await readEvalReport(second),
      Number(readStringOption(parsed, "--tolerance") ?? 0),
    );
    console.log(
      parsed.flags.has("--json") ? JSON.stringify(comparison) : formatComparison(comparison),
    );
    return comparison.regressed ? 1 : 0;
  }
  const report = await rescoreEvalReport(second ?? process.cwd(), await readEvalReport(first));
  const format = readStringOption(parsed, "--format");
  console.log(format ? formatEvalReport(report, format) : JSON.stringify(report));
  return report.failed || report.tokenCapReached ? 1 : 0;
}

export async function reportBaseline(
  target: string,
  reportId: string,
  baseline: string | undefined,
  save: boolean,
  tolerance: string | undefined,
  json = false,
): Promise<boolean> {
  const report = await readEvalReport(join(target, ".plico", "evals", `${reportId}.json`));
  let regressed = false;
  if (baseline) {
    const comparison = compareEvalReports(
      await readEvalReport(baseline),
      report,
      Number(tolerance ?? 0),
    );
    console.error(json ? JSON.stringify(comparison) : formatComparison(comparison));
    regressed = comparison.regressed;
  }
  if (save)
    await writeFile(join(target, "evals", "baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
  return regressed;
}
