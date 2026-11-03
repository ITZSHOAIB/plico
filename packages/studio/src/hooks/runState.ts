import type { PlicoEvent, RunStatus, RunSummary } from "../types";

export function isTerminalEvent(event: PlicoEvent): boolean {
  return (
    event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled"
  );
}

export function statusAfter(run: RunSummary, event: PlicoEvent): RunSummary {
  let status: RunStatus = run.status;
  if (event.type === "run.completed") status = "completed";
  else if (event.type === "run.failed") status = "failed";
  else if (event.type === "run.cancelled") status = "cancelled";
  else if (event.type === "run.waiting") status = "waiting";
  else if (status === "waiting") status = "running";
  return { ...run, status, endedAt: isTerminalEvent(event) ? event.timestamp : null };
}
