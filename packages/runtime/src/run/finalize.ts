import type { PlicoEvent, RunResult, RunStatus } from "@plico/contracts";
import type { ValidationIssue } from "@plico/core";
import type { EventStore } from "../types/index.js";

export interface FinalizeRunInput {
  runId: string;
  projectRoot: string;
  projectName: string;
  status: RunStatus;
  startedAt: string;
  events: PlicoEvent[];
  output?: string | undefined;
  errors?: ValidationIssue[] | undefined;
  eventStore?: EventStore | undefined;
}

/** Builds the terminal RunResult and persists the run when an event store is configured. */
export async function finalizeRun(input: FinalizeRunInput): Promise<RunResult> {
  const result: RunResult = {
    runId: input.runId,
    status: input.status,
    ...(input.output === undefined ? {} : { output: input.output }),
    events: input.events,
    ...(input.errors === undefined ? {} : { errors: input.errors }),
  };

  await input.eventStore?.persistRun({
    runId: input.runId,
    projectRoot: input.projectRoot,
    projectName: input.projectName,
    status: input.status,
    startedAt: input.startedAt,
    endedAt: new Date().toISOString(),
    ...(input.output === undefined ? {} : { output: input.output }),
    events: input.events,
  });

  return result;
}
