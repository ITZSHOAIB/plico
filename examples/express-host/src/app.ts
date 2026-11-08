import { fileURLToPath } from "node:url";
import { createPlico, type Plico } from "@plico/server";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

/** Replace this with your real session lookup. Here a header stands in for a logged-in user. */
function currentUser(req: Request): string | undefined {
  const id = req.header("x-user-id");
  return id ? id : undefined;
}

function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (currentUser(req) === undefined) {
    res.status(401).json({ error: "Log in first." });
    return;
  }
  next();
}

/** The host app: its own routes, plus Plico's `/v1` API under `/plico` for logged-in users. */
export function createApp(plico: Plico): Express {
  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({ app: "express-host", plico: "/plico/v1/threads" });
  });

  app.use(
    "/plico",
    requireUser,
    plico.node({
      // Every thread and run is stamped with the user and visible only to them.
      scope: (request) => ({ userId: request.headers.get("x-user-id") ?? "" }),
      // Tools read this as ctx.context; run.started and approval decisions record it.
      context: (request) => ({ actor: request.headers.get("x-user-id") ?? "" }),
    }),
  );

  return app;
}

export async function startApp(port = 3000): Promise<void> {
  const plico = await createPlico({
    projectRoot: fileURLToPath(new URL("../agent", import.meta.url)),
    databasePath: "plico.sqlite",
  });
  const server = createApp(plico).listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
  process.once("SIGINT", () => {
    server.close(() => void plico.close());
  });
}
