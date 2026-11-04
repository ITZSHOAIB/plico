import type { Engine, EventStore } from "@plico/runtime";

/** Persist a terminal outcome only after the engine confirms no worker is still running. */
export async function finishFailedThreadRun(
  runId: string,
  threadId: string,
  projectRoot: string,
  engine: Engine,
  eventStore: EventStore,
): Promise<void> {
  const state = await engine.status(runId);
  if (state?.state !== "failed") return;
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
      payload: { projectRoot, projectName: "", threadId },
    });
    run = await eventStore.getRun(runId);
  }
  if (run?.status !== "running") return;
  const events = await eventStore.getEvents(runId);
  let sequence = events.at(-1)?.sequence ?? 0;
  if (events.at(-1)?.type !== "run.error") {
    sequence++;
    await eventStore.appendEvent({
      schemaVersion: 1,
      streamType: "run",
      streamId: runId,
      runId,
      id: `evt-${String(sequence).padStart(4, "0")}`,
      sequence,
      timestamp: new Date().toISOString(),
      type: "run.error",
      payload: { phase: "runtime", message: "Run execution failed before it could finish." },
    });
  }
  sequence++;
  await eventStore.appendEvent({
    schemaVersion: 1,
    streamType: "run",
    streamId: runId,
    runId,
    id: `evt-${String(sequence).padStart(4, "0")}`,
    sequence,
    timestamp: new Date().toISOString(),
    type: "run.failed",
    payload: { phase: "runtime" },
  });
}
