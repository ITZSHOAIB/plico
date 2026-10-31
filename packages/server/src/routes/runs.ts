import { buildArtifactWorkspace, runProject } from "@plico/runtime";
import { readJsonBody } from "../body.js";
import { sendError } from "../errors.js";
import { sendJson } from "../responses.js";
import { normalizeScript } from "../script.js";
import { handleEventStream, parseAfterCursor } from "../stream.js";
import type { Route, RouteContext } from "./types.js";

function readAfterCursor(url: URL): number | undefined {
  const after = url.searchParams.get("after");
  return after === null ? undefined : parseAfterCursor(after);
}

function runNotFound({ response }: RouteContext, runId: string): void {
  sendError(response, 404, "run.not_found", `Unknown run ID: ${runId}`);
}

export const runRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/runs\/dry$/,
    handler: async ({ projectRoot, eventStore, request, response }) => {
      const body = await readJsonBody(request);
      const script = body.script === undefined ? undefined : normalizeScript(body.script);
      const result = await runProject(projectRoot, {
        ...(script === undefined ? {} : { script }),
        eventStore,
      });
      sendJson(response, 200, result);
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs$/,
    handler: async ({ eventStore, response }) => {
      sendJson(response, 200, await eventStore.listRuns());
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)$/,
    handler: async (context) => {
      const runId = context.params[0] ?? "";
      const run = await context.eventStore.getRun(runId);
      if (!run) {
        runNotFound(context, runId);
        return;
      }

      sendJson(context.response, 200, run);
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/events\/stream$/,
    handler: async (context) => {
      const runId = context.params[0] ?? "";
      const afterSequence = readAfterCursor(context.url);
      await handleEventStream({
        projectRoot: context.projectRoot,
        eventStore: context.eventStore,
        request: context.request,
        response: context.response,
        runId,
        afterSequence,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/events$/,
    handler: async (context) => {
      const runId = context.params[0] ?? "";
      const afterSequence = readAfterCursor(context.url);
      const run = await context.eventStore.getRun(runId);
      if (!run) {
        runNotFound(context, runId);
        return;
      }

      const events = await context.eventStore.getEvents(
        runId,
        afterSequence === undefined ? {} : { afterSequence },
      );
      sendJson(context.response, 200, events);
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/workspace$/,
    handler: async (context) => {
      const runId = context.params[0] ?? "";
      const run = await context.eventStore.getRun(runId);
      if (!run) {
        runNotFound(context, runId);
        return;
      }

      const events = await context.eventStore.getEvents(runId);
      const workspace = buildArtifactWorkspace(runId, events);
      if (!workspace) {
        sendError(
          context.response,
          404,
          "workspace.not_found",
          `No artifact workspace for run: ${runId}`,
        );
        return;
      }

      sendJson(context.response, 200, workspace);
    },
  },
];
