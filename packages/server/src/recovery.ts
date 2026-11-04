import { resolve } from "node:path";
import {
  type Engine,
  type EventStore,
  type ModelProvider,
  recoverRuns,
  runProject,
  type ThreadStore,
} from "@plico/runtime";
import { finishFailedThreadRun } from "./thread-failure.js";

interface RecoveryOptions {
  projectRoot: string;
  eventStore: EventStore;
  threadStore?: ThreadStore;
  engine: Engine;
  provider?: ModelProvider;
  providerRecoveryKey?: string;
  /** Stops recovery from touching stores a shutting-down server is closing. */
  isClosed?: () => boolean;
}

interface ResumeQueuedOptions extends RecoveryOptions {
  providerAccountKey?: string;
}

/** Continue runs a dead process left behind, settling any failed thread reservations. */
export async function recoverPlicoState(options: RecoveryOptions): Promise<void> {
  const dryRuns = recoverRuns({
    engine: options.engine,
    eventStore: options.eventStore,
    recoveryFilter: { projectRoot: options.projectRoot },
  });
  const modelRuns =
    options.provider && options.providerRecoveryKey
      ? recoverRuns({
          engine: options.engine,
          eventStore: options.eventStore,
          provider: options.provider,
          recoveryFilter: {
            projectRoot: options.projectRoot,
            providerRecoveryKey: options.providerRecoveryKey,
            providerOnly: true,
          },
        })
      : Promise.resolve([]);

  const [dry, model] = await Promise.all([dryRuns, modelRuns]);
  for (const run of [...dry, ...model]) {
    if (run.state !== "failed") continue;
    console.error(`Recovered run ${run.runId}: failed${run.error ? ` (${run.error})` : ""}`);
    if (!options.threadStore || options.isClosed?.()) continue;
    const threadId = await options.threadStore.getThreadForRun(run.runId);
    if (!threadId || options.isClosed?.()) continue;
    await finishFailedThreadRun(
      run.runId,
      threadId,
      options.projectRoot,
      options.engine,
      options.eventStore,
      run.error,
    );
  }
}

/** Start thread runs that were reserved but never reached the engine. */
export async function resumeQueuedRuns(options: ResumeQueuedOptions): Promise<void> {
  if (!options.provider || !options.providerAccountKey || !options.threadStore) return;
  const queued = await options.threadStore.listQueuedRuns();
  for (const run of queued) {
    if (options.isClosed?.()) return;
    if (
      !run.projectRoot ||
      identity(run.projectRoot) !== identity(options.projectRoot) ||
      run.providerKey !== options.providerAccountKey
    )
      continue;
    const status = await options.engine.status(run.runId);
    if (status) {
      if (status.state === "failed" || status.state === "cancelled" || status.state === "completed")
        await finishFailedThreadRun(
          run.runId,
          run.threadId,
          options.projectRoot,
          options.engine,
          options.eventStore,
          status.state === "failed" ? "Queued run failed before it could be resumed." : undefined,
        ).catch((error: unknown) => console.error("Could not settle queued thread run", error));
      continue;
    }
    void runProject(options.projectRoot, {
      runId: run.runId,
      threadId: run.threadId,
      history: run.history,
      message: run.content,
      provider: options.provider,
      providerRecoveryKey: options.providerRecoveryKey ?? options.providerAccountKey,
      engine: options.engine,
      eventStore: options.eventStore,
    }).catch(async (error: unknown) => {
      try {
        await finishFailedThreadRun(
          run.runId,
          run.threadId,
          options.projectRoot,
          options.engine,
          options.eventStore,
          error,
        );
      } catch (settleError) {
        console.error("Could not record failed queued thread run", settleError);
      }
      console.error(
        `Queued run ${run.runId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}

function identity(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
