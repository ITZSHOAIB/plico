import type { RunSummary } from "@plico/runtime";

export function formatRunSummaries(
  target: string,
  databasePath: string,
  runs: RunSummary[],
): string[] {
  const lines = [`Persisted runs for ${target} (${databasePath})`];

  if (runs.length === 0) {
    lines.push("No persisted runs found.");
    return lines;
  }

  for (const run of runs) {
    const summary = [run.runId, run.status, run.projectName || "unknown project", run.endedAt].join(
      " | ",
    );
    lines.push(summary);
  }

  return lines;
}
