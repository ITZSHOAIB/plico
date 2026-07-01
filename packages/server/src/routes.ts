import type { IncomingMessage, ServerResponse } from "node:http";
import { type EventStore, runProject } from "@plico/runtime";
import { readJsonBody } from "./body.js";
import { errorMessage, HttpError, sendError } from "./errors.js";
import { loadProjectOrThrow } from "./project.js";
import { sendJson } from "./responses.js";
import { normalizeScript } from "./script.js";

interface HandleRequestOptions {
  projectRoot: string;
  eventStore: EventStore;
  request: IncomingMessage;
  response: ServerResponse;
}

export async function handleRequest(options: HandleRequestOptions): Promise<void> {
  const url = new URL(options.request.url ?? "/", "http://127.0.0.1");

  try {
    if (options.request.method === "GET" && url.pathname === "/health") {
      sendJson(options.response, 200, { ok: true });
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/project") {
      const project = await loadProjectOrThrow(options.projectRoot);
      sendJson(options.response, 200, { project });
      return;
    }

    if (options.request.method === "POST" && url.pathname === "/v1/runs/dry") {
      const body = await readJsonBody(options.request);
      const script = body.script === undefined ? undefined : normalizeScript(body.script);
      const result = await runProject(options.projectRoot, {
        ...(script === undefined ? {} : { script }),
        eventStore: options.eventStore,
      });
      sendJson(options.response, 200, result);
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (options.request.method === "GET" && runMatch) {
      const runId = decodeURIComponent(runMatch[1] ?? "");
      const run = await options.eventStore.getRun(runId);
      if (!run) {
        sendError(options.response, 404, "run.not_found", `Unknown run ID: ${runId}`);
        return;
      }

      sendJson(options.response, 200, run);
      return;
    }

    const eventsMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (options.request.method === "GET" && eventsMatch) {
      const runId = decodeURIComponent(eventsMatch[1] ?? "");
      const after = url.searchParams.get("after");
      const afterSequence = after === null ? undefined : parseAfterCursor(after);
      const run = await options.eventStore.getRun(runId);
      if (!run) {
        sendError(options.response, 404, "run.not_found", `Unknown run ID: ${runId}`);
        return;
      }

      const events = await options.eventStore.getEvents(
        runId,
        afterSequence === undefined ? {} : { afterSequence },
      );
      sendJson(options.response, 200, events);
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/runs") {
      const runs = await options.eventStore.listRuns();
      sendJson(options.response, 200, runs);
      return;
    }

    sendError(options.response, 404, "route.not_found", "Unknown route.");
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(options.response, error.status, error.code, error.message);
      return;
    }

    sendError(options.response, 500, "server.error", errorMessage(error));
  }
}

function parseAfterCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "cursor.invalid", `Malformed cursor: ${value}`);
  }

  return parsed;
}
