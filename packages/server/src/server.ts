import { createServer, type Server } from "node:http";
import { createSqliteEventStore } from "@plico/runtime";
import { handleRequest } from "./routes.js";
import { serveStaticFile } from "./serve-static.js";
import type { CreatePlicoServerOptions, PlicoServer, ServePlicoOptions } from "./types.js";

export async function createPlicoServer(options: CreatePlicoServerOptions): Promise<PlicoServer> {
  const projectRoot = options.projectRoot;
  const eventStore = options.eventStore;
  const studioPath = options.studioPath;

  return {
    requestListener: async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const isApiPath = url.pathname === "/health" || url.pathname.startsWith("/v1/");

      if (isApiPath) {
        await handleRequest({ projectRoot, eventStore, request, response });
        return;
      }

      if (studioPath) {
        const served = await serveStaticFile(studioPath, url.pathname, response);
        if (served) return;

        await serveStaticFile(studioPath, "/index.html", response);
        return;
      }

      await handleRequest({ projectRoot, eventStore, request, response });
    },
  };
}

export async function servePlico(options: ServePlicoOptions): Promise<Server> {
  const eventStore = createSqliteEventStore({ databasePath: options.databasePath });
  const server = createServer(
    (
      await createPlicoServer({
        projectRoot: options.projectRoot,
        eventStore,
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
