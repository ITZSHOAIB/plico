import { PlicoError, statusForCode } from "../app/errors.js";
import type { AppDeps } from "../app/types.js";
import { errorMessage, errorResponse, HttpError } from "../errors.js";
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
  request: Request;
}

export async function handleRequest(options: HandleRequestOptions): Promise<Response> {
  const { app, stop, studioPath, allowScript, request } = options;
  const url = new URL(request.url);

  try {
    if (app.inspect && request.method !== "GET" && request.method !== "HEAD")
      return errorResponse(
        403,
        "inspection.read_only",
        "This Plico server is inspection-only and does not change runs or threads.",
      );

    const pathMatches = routes.filter(
      (route) => route.pattern.test(url.pathname) && !(app.scope && route.hostOnly),
    );
    const route = pathMatches.find((candidate) => candidate.method === request.method);
    if (route) {
      const match = route.pattern.exec(url.pathname);
      const params = (match?.slice(1) ?? []).map(decodeParam);
      return await route.handler({
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
        url,
        params,
      });
    }

    if (pathMatches.length > 0) {
      return errorResponse(405, "method.not_allowed", "Method not allowed.", {
        allow: [...new Set(pathMatches.map((r) => r.method))].join(", "),
      });
    }

    return errorResponse(404, "route.not_found", "Unknown route.");
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.status, error.code, error.message);
    }
    if (error instanceof PlicoError) {
      return errorResponse(statusForCode(error.code), error.code, error.message);
    }

    console.error(`plico server error: ${errorMessage(error)}`);
    return errorResponse(500, "server.error", "Internal server error.");
  }
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "request.invalid_path", "Malformed percent-encoding in path.");
  }
}
