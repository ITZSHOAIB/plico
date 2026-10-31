import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore } from "@plico/runtime";
import { errorMessage, HttpError, sendError } from "../errors.js";
import { artifactRoutes } from "./artifacts.js";
import { evalRoutes } from "./eval.js";
import { healthRoutes } from "./health.js";
import { projectRoutes } from "./project.js";
import { readinessRoutes } from "./readiness.js";
import { runRoutes } from "./runs.js";
import type { Route } from "./types.js";

const routes: readonly Route[] = [
  ...healthRoutes,
  ...projectRoutes,
  ...runRoutes,
  ...artifactRoutes,
  ...evalRoutes,
  ...readinessRoutes,
];

interface HandleRequestOptions {
  projectRoot: string;
  eventStore: EventStore;
  studioPath: string | undefined;
  request: IncomingMessage;
  response: ServerResponse;
}

export async function handleRequest(options: HandleRequestOptions): Promise<void> {
  const { projectRoot, eventStore, studioPath, request, response } = options;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  try {
    const pathMatches = routes.filter((route) => route.pattern.test(url.pathname));
    const route = pathMatches.find((candidate) => candidate.method === request.method);
    if (route) {
      const match = route.pattern.exec(url.pathname);
      const params = (match?.slice(1) ?? []).map(decodeParam);
      await route.handler({ projectRoot, eventStore, studioPath, request, response, url, params });
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
