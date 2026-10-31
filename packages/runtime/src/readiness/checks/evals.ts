import { access } from "node:fs/promises";
import { join } from "node:path";
import { digestEvalFixtures, discoverEvalCases } from "../../evals/discover.js";
import type { EvalCase, EvalReport, EventStore, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkEvals(
  projectRoot: string,
  eventStore: EventStore | undefined,
): Promise<ReadinessDiagnostic[]> {
  const evalsDir = join(projectRoot, "evals");

  try {
    await access(evalsDir);
  } catch {
    return [
      makeDiagnostic(
        "warning",
        "evals.fixtures",
        "evals/ directory not found. Create evals/ to add eval fixtures.",
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
          "No .script.json eval fixtures found. Add evals to track behavior.",
        )
      : makeDiagnostic("ok", "evals.fixtures", `${cases.length} eval fixture(s) found`);

  return eventStore
    ? [fixtures, await readEvalResults(eventStore, await digestEvalFixtures(evalsDir))]
    : [fixtures];
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
