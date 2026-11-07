const visibleRunIdLength = 12;

export function formatRunId(runId: string): string {
  return runId.length > visibleRunIdLength ? `${runId.slice(0, visibleRunIdLength)}…` : runId;
}
