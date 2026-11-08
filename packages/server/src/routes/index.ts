import type { IncomingMessage, ServerResponse } from "node:http";
import { PlicoError, statusForCode } from "../app/errors.js";
import type { AppDeps } from "../app/types.js";
import { errorMessage, HttpError, sendError } from "../errors.js";
import { artifactRoutes } from "./artifacts.js";
import { evalRoutes } from "./eval.js";
import { healthRoutes } from "./health.js";
import { projectRoutes } from "./project.js";
import { readinessRoutes } from "./readiness.js";
import { runRoutes } from "./runs.js";
import { threadRoutes } from "./threads.js";
import type { Route } from "./types.js";

const routes: readonly Route[] = [
  ...healthRoutes,
  ...projectRoutes,
  ...runRoutes,
  ...threadRoutes,
  ...artifactRoutes,
  ...evalRoutes,
  ...readinessRoutes,
];

interface HandleRequestOptions {
  app: AppDeps;
  /** Aborts when the host closes Plico, so open event streams end. */
  stop: AbortSignal;
  studioPath: string | undefined;
  allowScript: boolean;
  request: IncomingMessage;
  response: ServerResponse;
}

export async function handleRequest(options: HandleRequestOptions): Promise<void> {
  const { app, stop, studioPath, allowScript, request, response } = options;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  try {
    const pathMatches = routes.filter((route) => route.pattern.test(url.pathname));
    const route = pathMatches.find((candidate) => candidate.method === request.method);
    if (route) {
      const match = route.pattern.exec(url.pathname);
      const params = (match?.slice(1) ?? []).map(decodeParam);
      await route.handler({
        app,
        stop,
        projectRoot: app.projectRoot,
        eventStore: app.eventStore,
        threadStore: app.threadStore,
        provider: app.provider,
        providerRecoveryKey: app.providerRecoveryKey,
        providerAccountKey: app.providerAccountKey,
        engine: app.engine,
        studioPath,
        allowScript,
        request,
        response,
        url,
        params,
      });
      return;
    }

    if (pathMatches.length > 0) {
      response.setHeader("allow", [...new Set(pathMatches.map((r) => r.method))].join(", "));
      sendError(response, 405, "method.not_allowed", "Method not allowed.");
      return;
    }

    sendError(response, 404, "route.not_found", "Unknown route.");
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    if (error instanceof PlicoError) {
      sendError(response, statusForCode(error.code), error.code, error.message);
      return;
    }

    console.error(`plico server error: ${errorMessage(error)}`);
    sendError(response, 500, "server.error", "Internal server error.");
  }
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "request.invalid_path", "Malformed percent-encoding in path.");
  }
}
