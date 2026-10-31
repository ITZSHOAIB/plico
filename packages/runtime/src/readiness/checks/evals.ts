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
      diagnostics.push(await describeEvalRuns(eventStore));
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

async function describeEvalRuns(eventStore: EventStore): Promise<ReadinessDiagnostic> {
  const runs = await eventStore.listRuns();
  const evalRuns = runs.filter((r) => r.runId.startsWith("eval-"));
  if (evalRuns.length === 0) {
    return makeDiagnostic(
      "warning",
      "evals.results",
      "No eval runs have been executed. Run plico eval to see results.",
    );
  }

  const sorted = [...evalRuns].sort(
    (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime(),
  );
  const lastEval = sorted[0];
  const passed = evalRuns.filter((r) => r.status === "completed").length;
  return makeDiagnostic(
    "ok",
    "evals.results",
    `${evalRuns.length} eval run(s), ${passed} passed (last: ${lastEval?.runId ?? "none"})`,
  );
}
