import { createServer, type Server } from "node:http";
import { validateProject } from "@plico/core";
import {
  createConfiguredModelProvider,
  createEngine,
  createMemoryJournal,
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  modelProviderAccountKey,
  modelProviderRecoveryKey,
} from "@plico/runtime";
import { HttpError, sendError } from "./errors.js";
import { assertTrustedRequest } from "./origin-guard.js";
import { recoverPlicoState, resumeQueuedRuns } from "./recovery.js";
import { handleRequest } from "./routes/index.js";
import { serveStaticFile } from "./serve-static.js";
import type { CreatePlicoServerOptions, PlicoServer, ServePlicoOptions } from "./types.js";

export async function createPlicoServer(options: CreatePlicoServerOptions): Promise<PlicoServer> {
  const projectRoot = options.projectRoot;
  const eventStore = options.eventStore;
  const studioPath = options.studioPath;
  const engine = options.engine ?? createEngine({ journal: createMemoryJournal() });
  const providerAccountKey = options.providerAccountKey ?? options.providerRecoveryKey;
  const recover = async () => {
    await recoverPlicoState({
      projectRoot,
      eventStore,
      engine,
      ...(options.threadStore ? { threadStore: options.threadStore } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.providerRecoveryKey ? { providerRecoveryKey: options.providerRecoveryKey } : {}),
    });
    await resumeQueuedRuns({
      projectRoot,
      eventStore,
      engine,
      ...(options.threadStore ? { threadStore: options.threadStore } : {}),
      ...(providerAccountKey ? { providerAccountKey } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.providerRecoveryKey ? { providerRecoveryKey: options.providerRecoveryKey } : {}),
    });
  };

  return {
    requestListener: async (request, response) => {
      try {
        assertTrustedRequest(request, {
          allowRemote: options.allowRemote === true,
          publicOrigin: options.publicOrigin,
        });
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        sendError(response, error.status, error.code, error.message);
        return;
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const isApiPath = url.pathname === "/health" || url.pathname.startsWith("/v1/");
      const context = {
        projectRoot,
        eventStore,
        threadStore: options.threadStore,
        provider: options.provider,
        providerRecoveryKey: options.providerRecoveryKey,
        providerAccountKey: options.providerAccountKey,
        engine,
        studioPath,
        request,
        response,
      };

      if (isApiPath) {
        await handleRequest(context);
        return;
      }

      if (studioPath) {
        const served = await serveStaticFile(studioPath, url.pathname, response);
        if (served) return;

        await serveStaticFile(studioPath, "/index.html", response);
        return;
      }

      await handleRequest(context);
    },
    recover,
  };
}

export async function servePlico(options: ServePlicoOptions): Promise<Server> {
  const eventStore = createSqliteEventStore({ databasePath: options.databasePath });
  const validation = await validateProject(options.projectRoot);
  const leaseMs = validation.project?.config.execution?.leaseMs;
  const engine = createSqliteEngine({
    databasePath: options.databasePath,
    ...(leaseMs === undefined ? {} : { leaseMs }),
  });
  // Runs a dead process left behind continue in the background; they appear in the log as they go.
  const model = validation.project?.config.model;
  const provider = model ? createConfiguredModelProvider(model) : undefined;
  const providerRecoveryKey = model ? modelProviderRecoveryKey(model) : undefined;
  const providerAccountKey = model ? modelProviderAccountKey(model) : undefined;
  const threadStore = createSqliteThreadStore({ databasePath: options.databasePath });
  let closing = false;
  const recovery = recoverPlicoState({
    projectRoot: options.projectRoot,
    eventStore,
    threadStore,
    engine,
    ...(provider ? { provider } : {}),
    ...(providerRecoveryKey ? { providerRecoveryKey } : {}),
    isClosed: () => closing,
  });
  void recovery.catch((error: unknown) =>
    console.error(`Recovery incomplete: ${error instanceof Error ? error.message : String(error)}`),
  );
  try {
    await resumeQueuedRuns({
      projectRoot: options.projectRoot,
      eventStore,
      threadStore,
      engine,
      ...(provider ? { provider } : {}),
      ...(providerRecoveryKey ? { providerRecoveryKey } : {}),
      ...(providerAccountKey ? { providerAccountKey } : {}),
      isClosed: () => closing,
    });
  } catch (error) {
    closing = true;
    threadStore.close();
    throw error;
  }
  const server = createServer(
    (
      await createPlicoServer({
        projectRoot: options.projectRoot,
        eventStore,
        threadStore,
        ...(provider ? { provider } : {}),
        ...(providerRecoveryKey ? { providerRecoveryKey } : {}),
        ...(providerAccountKey ? { providerAccountKey } : {}),
        engine,
        ...(options.studioPath === undefined ? {} : { studioPath: options.studioPath }),
        ...(options.allowRemote === undefined ? {} : { allowRemote: options.allowRemote }),
      })
    ).requestListener,
  );
  server.once("close", () => {
    closing = true;
    threadStore.close();
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", () => resolve());
    });
  } catch (error) {
    closing = true;
    threadStore.close();
    throw error;
  }

  return server;
}
