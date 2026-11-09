import type { RequestListener } from "node:http";
import { createEngine, createMemoryJournal } from "@plico-ai/runtime";
import { assemblePlico } from "../app/assemble.js";
import type { AppDeps, Plico } from "../app/types.js";
import { createRequestListener, type ListenerOptions } from "../listener.js";
import { recoverPlicoState, resumeQueuedRuns } from "../recovery.js";

export type TestServerOptions = Omit<AppDeps, "engine"> &
  ListenerOptions & { engine?: AppDeps["engine"] };

export interface TestServer {
  plico: Plico;
  requestListener: RequestListener;
  /** Resume interrupted and queued runs, as `createPlico` does on start. */
  recover(): Promise<void>;
}

/**
 * Builds the server over stores and a scripted provider the test supplies. `createPlico` takes only a
 * project folder, so tests that need a fake model use this instead. Not part of the package.
 */
export function createTestServer(options: TestServerOptions): TestServer {
  const {
    studioPath,
    allowRemote,
    publicOrigin,
    allowScript,
    engine = createEngine({ journal: createMemoryJournal() }),
    ...rest
  } = options;
  const plico = assemblePlico({ ...rest, engine });
  const recoveryOptions = {
    projectRoot: options.projectRoot,
    eventStore: options.eventStore,
    engine,
    ...(options.threadStore ? { threadStore: options.threadStore } : {}),
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.providerRecoveryKey ? { providerRecoveryKey: options.providerRecoveryKey } : {}),
  };
  const providerAccountKey = options.providerAccountKey ?? options.providerRecoveryKey;
  return {
    plico,
    requestListener: createRequestListener(plico, {
      ...(studioPath === undefined ? {} : { studioPath }),
      ...(allowRemote === undefined ? {} : { allowRemote }),
      ...(publicOrigin === undefined ? {} : { publicOrigin }),
      ...(allowScript === undefined ? {} : { allowScript }),
    }),
    async recover() {
      await recoverPlicoState(recoveryOptions);
      await resumeQueuedRuns({
        ...recoveryOptions,
        ...(providerAccountKey ? { providerAccountKey } : {}),
      });
    },
  };
}
