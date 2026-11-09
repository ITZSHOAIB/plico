import type { PlicoEvent, RunResult, RunStatus } from "@plico-ai/contracts";
import type { ValidationIssue } from "@plico-ai/core";
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

/** Builds the result after the run has stopped or finished. */
export async function finalizeRun(input: FinalizeRunInput): Promise<RunResult> {
  const result: RunResult = {
    runId: input.runId,
    status: input.status,
    ...(input.output === undefined ? {} : { output: input.output }),
    events: input.events,
    ...(input.errors === undefined ? {} : { errors: input.errors }),
  };

  return result;
}
