import { validateProject } from "@plico/core";
import {
  createConfiguredModelProvider,
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  modelProviderAccountKey,
  modelProviderRecoveryKey,
} from "@plico/runtime";
import { assemblePlico } from "./app/assemble.js";
import type { Plico } from "./app/types.js";
import { recoverPlicoState, resumeQueuedRuns } from "./recovery.js";

export interface CreatePlicoOptions {
  /** The project folder. Its files define the agent; nothing else can. */
  projectRoot: string;
  /** SQLite file for threads, runs, events and the engine journal. */
  databasePath: string;
}

/**
 * Opens a Plico agent inside the calling process: stores, engine and provider come from the project
 * and the database path. Runs a dead process left behind continue in the background, and queued
 * runs are resumed before this returns. Call `close()` before the process exits.
 */
export function createPlico(options: CreatePlicoOptions): Promise<Plico> {
  return openPlico(options, false);
}

/**
 * `createPlico`, or with `inspect` a Plico that only reads: it recovers and resumes nothing, so a
 * second process on a host's database cannot act on the host's runs.
 */
export async function openPlico(options: CreatePlicoOptions, inspect: boolean): Promise<Plico> {
  const unknown = Object.keys(options).filter(
    (key) => key !== "projectRoot" && key !== "databasePath",
  );
  if (unknown.length > 0)
    throw new TypeError(
      `createPlico accepts only projectRoot and databasePath; files define the agent. Unknown option: ${unknown.join(", ")}`,
    );
  const { projectRoot, databasePath } = options;
  const eventStore = createSqliteEventStore({ databasePath });
  const validation = await validateProject(projectRoot);
  const leaseMs = validation.project?.config.execution?.leaseMs;
  const engine = createSqliteEngine({
    databasePath,
    ...(leaseMs === undefined ? {} : { leaseMs }),
  });
  const model = validation.project?.config.model;
  const provider = model ? createConfiguredModelProvider(model) : undefined;
  const providerRecoveryKey = model ? modelProviderRecoveryKey(model) : undefined;
  const providerAccountKey = model ? modelProviderAccountKey(model) : undefined;
  const threadStore = createSqliteThreadStore({ databasePath });
  let closing = false;
  const recoveryOptions = {
    projectRoot,
    eventStore,
    threadStore,
    engine,
    ...(provider ? { provider } : {}),
    ...(providerRecoveryKey ? { providerRecoveryKey } : {}),
    isClosed: () => closing,
  };
  if (!inspect) {
    void recoverPlicoState(recoveryOptions).catch((error: unknown) =>
      console.error(
        `Recovery incomplete: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    try {
      await resumeQueuedRuns({
        ...recoveryOptions,
        ...(providerAccountKey ? { providerAccountKey } : {}),
      });
    } catch (error) {
      closing = true;
      threadStore.close();
      throw error;
    }
  }
  return assemblePlico(
    {
      projectRoot,
      eventStore,
      threadStore,
      engine,
      ...(provider ? { provider } : {}),
      ...(providerRecoveryKey ? { providerRecoveryKey } : {}),
      ...(providerAccountKey ? { providerAccountKey } : {}),
      ...(inspect ? { inspect: true as const } : {}),
    },
    () => {
      closing = true;
      threadStore.close();
    },
  );
}
