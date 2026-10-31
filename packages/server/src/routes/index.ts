import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore } from "@plico/runtime";
import { errorMessage, HttpError, sendError } from "../errors.js";
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
  ...evalRoutes,
  ...readinessRoutes,
];

interface HandleRequestOptions {
  projectRoot: string;
  eventStore: EventStore;
  request: IncomingMessage;
  response: ServerResponse;
}

export async function handleRequest(options: HandleRequestOptions): Promise<void> {
  const { projectRoot, eventStore, request, response } = options;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  try {
    for (const route of routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;

      const params = match.slice(1).map((value) => decodeURIComponent(value));
      await route.handler({ projectRoot, eventStore, request, response, url, params });
      return;
    }

    sendError(response, 404, "route.not_found", "Unknown route.");
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }

    sendError(response, 500, "server.error", errorMessage(error));
  }
}
