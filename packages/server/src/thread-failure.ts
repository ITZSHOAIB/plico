import { type Engine, type EventStore, runFailureEvents } from "@plico-ai/runtime";
import type { Metadata } from "./app/metadata.js";

/**
 * Persist a terminal outcome after the engine confirms no worker is still running. A run whose
 * journal write never happened is also safe to fail: nothing can be executing it.
 */
export async function finishFailedThreadRun(
  runId: string,
  threadId: string,
  projectRoot: string,
  engine: Engine,
  eventStore: EventStore,
  error?: unknown,
  metadata?: Metadata,
): Promise<void> {
  const state = await engine.status(runId);
  if (state && state.state !== "failed") return;
  let run = await eventStore.getRun(runId);
  if (!run) {
    await eventStore.appendEvent({
      schemaVersion: 1,
      streamType: "run",
      streamId: runId,
      runId,
      id: "evt-0001",
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: "run.started",
      payload: {
        projectRoot,
        projectName: "",
        threadId,
        ...(metadata === undefined ? {} : { metadata }),
      },
    });
    run = await eventStore.getRun(runId);
  }
  if (run?.status !== "running") return;
  const events = await eventStore.getEvents(runId);
  for (const event of runFailureEvents(runId, events.at(-1), failureMessage(error)))
    await eventStore.appendEvent(event);
}

function failureMessage(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "Run execution failed before it could finish.";
}
