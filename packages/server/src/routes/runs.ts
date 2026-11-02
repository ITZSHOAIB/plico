import { runProject } from "@plico/runtime";
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
    pattern: /^\/v1\/runs$/,
    handler: async ({ projectRoot, eventStore, engine, request, response }) => {
      const body = await readJsonBody(request);
      const script = body.script === undefined ? undefined : normalizeScript(body.script);
      let resolveStarted!: (runId: string) => void;
      let rejectStarted!: (error: unknown) => void;
      const started = new Promise<string>((resolve, reject) => {
        resolveStarted = resolve;
        rejectStarted = reject;
      });
      void runProject(projectRoot, {
        eventStore,
        ...(engine === undefined ? {} : { engine }),
        ...(script === undefined ? {} : { script }),
        onStarted: resolveStarted,
      }).catch(rejectStarted);
      const runId = await started;
      sendJson(response, 202, { runId });
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/runs\/dry$/,
    handler: async ({ projectRoot, eventStore, engine, request, response }) => {
      const body = await readJsonBody(request);
      const script = body.script === undefined ? undefined : normalizeScript(body.script);
      const result = await runProject(projectRoot, {
        ...(script === undefined ? {} : { script }),
        eventStore,
        ...(engine === undefined ? {} : { engine }),
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
];
