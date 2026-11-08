import { cancelRun, listRunEvents, requireRun, runDry, signalRun, startRun } from "../app/runs.js";
import { readJsonBody } from "../body.js";
import { sendJson } from "../responses.js";
import { readScript } from "../script.js";
import { handleEventStream, parseAfterCursor } from "../stream.js";
import type { Route } from "./types.js";

function readAfterCursor(url: URL): number | undefined {
  const after = url.searchParams.get("after");
  return after === null ? undefined : parseAfterCursor(after);
}

export const runRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/runs$/,
    handler: async ({ app, allowScript, request, response }) => {
      const script = readScript(await readJsonBody(request), allowScript);
      sendJson(response, 202, await startRun(app, script === undefined ? {} : { script }));
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/runs\/dry$/,
    handler: async ({ app, allowScript, request, response }) => {
      const script = readScript(await readJsonBody(request), allowScript);
      sendJson(response, 200, await runDry(app, script === undefined ? {} : { script }));
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
    handler: async ({ app, params, response }) => {
      sendJson(response, 200, await requireRun(app, params[0] ?? ""));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/events\/stream$/,
    handler: async (context) => {
      const lastEventId = context.request.headers["last-event-id"];
      const afterSequence =
        lastEventId === undefined || lastEventId === ""
          ? readAfterCursor(context.url)
          : parseAfterCursor(Array.isArray(lastEventId) ? (lastEventId[0] ?? "") : lastEventId);
      await handleEventStream({
        app: context.app,
        stop: context.stop,
        request: context.request,
        response: context.response,
        runId: context.params[0] ?? "",
        afterSequence,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/events$/,
    handler: async ({ app, params, url, response }) => {
      sendJson(response, 200, await listRunEvents(app, params[0] ?? "", readAfterCursor(url)));
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/runs\/([^/]+)\/cancel$/,
    handler: async ({ app, params, response }) => {
      sendJson(response, 200, { result: await cancelRun(app, params[0] ?? "") });
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/runs\/([^/]+)\/signal$/,
    handler: async ({ app, params, request, response }) => {
      const runId = params[0] ?? "";
      await requireRun(app, runId);
      const body = await readJsonBody(request);
      const name = typeof body.name === "string" ? body.name : "";
      sendJson(response, 200, { result: await signalRun(app, runId, name, body.value) });
    },
  },
];
