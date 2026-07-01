import { createServer, type Server } from "node:http";
import { createSqliteEventStore } from "@plico/runtime";
import { handleRequest } from "./routes.js";
import type { CreatePlicoServerOptions, PlicoServer, ServePlicoOptions } from "./types.js";

export async function createPlicoServer(options: CreatePlicoServerOptions): Promise<PlicoServer> {
  const projectRoot = options.projectRoot;
  const eventStore = options.eventStore;

  return {
    requestListener: (request, response) => {
      void handleRequest({ projectRoot, eventStore, request, response });
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
      })
    ).requestListener,
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", () => resolve());
  });

  return server;
}
