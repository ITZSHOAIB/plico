import type { IncomingMessage, ServerResponse } from "node:http";
import { loadProject } from "@plico/core";
import {
  buildArtifactWorkspace,
  composeInstructions,
  type EventStore,
  runProject,
} from "@plico/runtime";
import { readJsonBody } from "./body.js";
import { errorMessage, HttpError, sendError } from "./errors.js";
import { loadProjectOrThrow } from "./project.js";
import { sendJson } from "./responses.js";
import { normalizeScript } from "./script.js";
import { handleEventStream, parseAfterCursor } from "./stream.js";

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

    if (options.request.method === "GET" && url.pathname === "/v1/instructions") {
      const project = await loadProject(options.projectRoot);
      const instructions = await composeInstructions(project);
      sendJson(options.response, 200, instructions);
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

    const streamMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events\/stream$/);
    if (options.request.method === "GET" && streamMatch) {
      const runId = decodeURIComponent(streamMatch[1] ?? "");
      const after = url.searchParams.get("after");
      const afterSequence = after === null ? undefined : parseAfterCursor(after);
      await handleEventStream({
        projectRoot: options.projectRoot,
        eventStore: options.eventStore,
        request: options.request,
        response: options.response,
        runId,
        afterSequence,
      });
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

    const workspaceMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/workspace$/);
    if (options.request.method === "GET" && workspaceMatch) {
      const runId = decodeURIComponent(workspaceMatch[1] ?? "");
      const run = await options.eventStore.getRun(runId);
      if (!run) {
        sendError(options.response, 404, "run.not_found", `Unknown run ID: ${runId}`);
        return;
      }

      const events = await options.eventStore.getEvents(runId);
      const workspace = buildArtifactWorkspace(runId, events);
      if (!workspace) {
        sendError(
          options.response,
          404,
          "workspace.not_found",
          `No artifact workspace for run: ${runId}`,
        );
        return;
      }

      sendJson(options.response, 200, workspace);
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
