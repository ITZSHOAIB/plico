import { createServer, type Server } from "node:http";
import { createPlico } from "./create-plico.js";
import { createRequestListener } from "./listener.js";
import type { ServePlicoOptions } from "./types.js";

/** `createPlico` plus an HTTP listener over its `/v1` API. Closing the server closes Plico. */
export async function servePlico(options: ServePlicoOptions): Promise<Server> {
  const plico = await createPlico({
    projectRoot: options.projectRoot,
    databasePath: options.databasePath,
  });
  const server = createServer(
    createRequestListener(plico, {
      ...(options.studioPath === undefined ? {} : { studioPath: options.studioPath }),
      ...(options.allowRemote === undefined ? {} : { allowRemote: options.allowRemote }),
      ...(options.allowScript === undefined ? {} : { allowScript: options.allowScript }),
    }),
  );
  server.once("close", () => void plico.close());

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", () => resolve());
    });
  } catch (error) {
    await plico.close();
    throw error;
  }

  return server;
}
