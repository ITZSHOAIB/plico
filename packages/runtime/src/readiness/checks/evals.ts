import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { EventStore, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export async function checkEvals(
  projectRoot: string,
  eventStore: EventStore | undefined,
): Promise<ReadinessDiagnostic[]> {
  const diagnostics: ReadinessDiagnostic[] = [];
  const evalsDir = join(projectRoot, "evals");

  try {
    const entries = await readdir(evalsDir);
    const scriptFiles = entries.filter((e) => e.endsWith(".script.json"));
    if (scriptFiles.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "evals.fixtures",
          "No .script.json eval fixtures found. Add evals to track behavior.",
        ),
      );
    } else {
      diagnostics.push(
        makeDiagnostic("ok", "evals.fixtures", `${scriptFiles.length} eval fixture(s) found`),
      );
    }

    if (eventStore) {
      diagnostics.push(await describeEvalResults(eventStore));
    }
  } catch {
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "evals.fixtures",
        "evals/ directory not found. Create evals/ to add eval fixtures.",
      ),
    );
  }

  return diagnostics;
}

async function describeEvalResults(eventStore: EventStore): Promise<ReadinessDiagnostic> {
  const report = await eventStore.getLatestEvalReport();
  if (!report || report.total === 0) {
    return makeDiagnostic(
      "warning",
      "evals.results",
      "No eval runs have been executed. Run plico eval to see results.",
    );
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
