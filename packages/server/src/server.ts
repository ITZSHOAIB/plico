import { createServer, type Server } from "node:http";
import { validateProject } from "@plico/core";
import {
  createConfiguredModelProvider,
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  modelProviderRecoveryKey,
  recoverRuns,
} from "@plico/runtime";
import { handleRequest } from "./routes/index.js";
import { serveStaticFile } from "./serve-static.js";
import type { CreatePlicoServerOptions, PlicoServer, ServePlicoOptions } from "./types.js";

export async function createPlicoServer(options: CreatePlicoServerOptions): Promise<PlicoServer> {
  const projectRoot = options.projectRoot;
  const eventStore = options.eventStore;
  const studioPath = options.studioPath;
  const engine = options.engine;

  return {
    requestListener: async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const isApiPath = url.pathname === "/health" || url.pathname.startsWith("/v1/");

      if (isApiPath) {
        await handleRequest({
          projectRoot,
          eventStore,
          threadStore: options.threadStore,
          engine,
          studioPath,
          request,
          response,
        });
        return;
      }

      if (studioPath) {
        const served = await serveStaticFile(studioPath, url.pathname, response);
        if (served) return;

        await serveStaticFile(studioPath, "/index.html", response);
        return;
      }

      await handleRequest({
        projectRoot,
        eventStore,
        threadStore: options.threadStore,
        engine,
        studioPath,
        request,
        response,
      });
    },
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
  const recovery = async () => {
    const dryRuns = recoverRuns({
      engine,
      eventStore,
      recoveryFilter: { projectRoot: options.projectRoot },
    });
    if (!model || !provider) return dryRuns;
    const modelRuns = recoverRuns({
      engine,
      eventStore,
      provider,
      recoveryFilter: {
        projectRoot: options.projectRoot,
        providerRecoveryKey: modelProviderRecoveryKey(model),
        providerOnly: true,
      },
    });
    const [dry, real] = await Promise.all([dryRuns, modelRuns]);
    return [...dry, ...real];
  };
  void recovery().then(
    (runs) => {
      for (const run of runs)
        if (run.state === "failed")
          console.error(`Recovered run ${run.runId}: failed${run.error ? ` (${run.error})` : ""}`);
    },
    (error: unknown) =>
      console.error(
        `Recovery incomplete: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
  const server = createServer(
    (
      await createPlicoServer({
        projectRoot: options.projectRoot,
        eventStore,
        threadStore: createSqliteThreadStore({ databasePath: options.databasePath }),
        engine,
        ...(options.studioPath === undefined ? {} : { studioPath: options.studioPath }),
      })
    ).requestListener,
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", () => resolve());
  });

  return server;
}
