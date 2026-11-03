import { createServer, type Server } from "node:http";
import { validateProject } from "@plico/core";
import { createSqliteEngine, createSqliteEventStore, recoverRuns } from "@plico/runtime";
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
        await handleRequest({ projectRoot, eventStore, engine, studioPath, request, response });
        return;
      }

      if (studioPath) {
        const served = await serveStaticFile(studioPath, url.pathname, response);
        if (served) return;

        await serveStaticFile(studioPath, "/index.html", response);
        return;
      }

      await handleRequest({ projectRoot, eventStore, engine, studioPath, request, response });
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
  void recoverRuns({ engine, eventStore }).then(
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
