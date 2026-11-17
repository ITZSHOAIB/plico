import { access } from "node:fs/promises";
import { getProjectPaths, getProjectRelativePaths } from "@plico-ai/core";
import { compareEvalReports } from "../../evals/compare.js";
import { digestEvalFixtures, discoverEvalCases } from "../../evals/discover.js";
import { listEvalReports } from "../../evals/reports.js";
import type { EvalCase, EvalReport, EventStore, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkEvals(
  projectRoot: string,
  eventStore: EventStore | undefined,
): Promise<ReadinessDiagnostic[]> {
  const evalsDir = getProjectPaths(projectRoot).directories.evals;
  const folder = `${getProjectRelativePaths().directories.evals}/`;

  try {
    await access(evalsDir);
  } catch {
    return [
      makeDiagnostic(
        "warning",
        "evals.fixtures",
        `${folder} directory not found. Create ${folder} to add eval fixtures.`,
      ),
    ];
  }

  let cases: EvalCase[];
  try {
    cases = await discoverEvalCases(evalsDir);
  } catch (error) {
    return [makeDiagnostic("error", "evals.fixtures", (error as Error).message)];
  }

  const fixtures =
    cases.length === 0
      ? makeDiagnostic(
          "warning",
          "evals.fixtures",
          "No eval cases found. Add evals to track behavior.",
        )
      : makeDiagnostic("ok", "evals.fixtures", `${cases.length} eval case(s) found`);

  const diagnostics = eventStore
    ? [fixtures, await readEvalResults(eventStore, await digestEvalFixtures(evalsDir))]
    : [fixtures];
  try {
    const [current, baseline] = await listEvalReports(projectRoot);
    if (current && baseline) {
      for (const warning of compareEvalReports(baseline, current).warnings.filter((w) =>
        w.startsWith("Different judges"),
      ))
        diagnostics.push(makeDiagnostic("warning", "evals.comparison", warning));
    }
  } catch (error) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "evals.comparison",
        `Could not read reports: ${(error as Error).message}`,
      ),
    );
  }
  return diagnostics;
}

async function readEvalResults(
  eventStore: EventStore,
  fixturesDigest: string,
): Promise<ReadinessDiagnostic> {
  try {
    return describeEvalResults(await eventStore.getLatestEvalReport(), fixturesDigest);
  } catch (error) {
    return makeDiagnostic(
      "error",
      "evals.results",
      `Could not read eval results: ${(error as Error).message}`,
    );
  }
}

function describeEvalResults(
  report: EvalReport | undefined,
  fixturesDigest: string,
): ReadinessDiagnostic {
  if (!report) {
    return makeDiagnostic(
      "warning",
      "evals.results",
      "No eval runs have been executed. Run plico eval to see results.",
    );
  }

  if (report.fixturesDigest !== fixturesDigest) {
    return makeDiagnostic(
      "warning",
      "evals.results",
      "Eval fixtures changed since the latest run. Run plico eval to refresh results.",
    );
  }

  if (report.total === 0) {
    return makeDiagnostic("warning", "evals.results", "The latest eval run found no fixtures.");
  }

  if (report.failed > 0) {
    const names = report.results.filter((r) => r.status === "fail").map((r) => r.name);
    return makeDiagnostic(
      "error",
      "evals.results",
      `${report.failed}/${report.total} eval(s) failed in the latest run: ${names.join(", ")}`,
    );
  }

  return makeDiagnostic(
    "ok",
    "evals.results",
    `${report.passed}/${report.total} eval(s) passed (${report.evaluatedAt})`,
  );
}
