import {
  cancelRun,
  listRunEvents,
  listRuns,
  requireRun,
  runDry,
  signalRun,
  startRun,
} from "../app/runs.js";
import { readJsonBody } from "../body.js";
import { jsonResponse } from "../responses.js";
import { readScript } from "../script.js";
import { eventStreamResponse, parseAfterCursor } from "../stream.js";
import { readMetadataFilter } from "./metadata-query.js";
import type { Route } from "./types.js";

function readAfterCursor(url: URL): number | undefined {
  const after = url.searchParams.get("after");
  return after === null ? undefined : parseAfterCursor(after);
}

export const runRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/runs$/,
    handler: async ({ app, allowScript, request }) => {
      const body = await readJsonBody(request);
      const script = readScript(body, allowScript);
      return jsonResponse(
        202,
        await startRun(app, {
          ...(script === undefined ? {} : { script }),
          metadata: body.metadata,
        }),
      );
    },
  },
  {
    method: "POST",
    hostOnly: true,
    pattern: /^\/v1\/runs\/dry$/,
    handler: async ({ app, allowScript, request }) => {
      const script = readScript(await readJsonBody(request), allowScript);
      return jsonResponse(200, await runDry(app, script === undefined ? {} : { script }));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs$/,
    handler: async ({ app, url }) =>
      jsonResponse(200, await listRuns(app, readMetadataFilter(url))),
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)$/,
    handler: async ({ app, params }) => jsonResponse(200, await requireRun(app, params[0] ?? "")),
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/events\/stream$/,
    handler: async (context) => {
      const lastEventId = context.request.headers.get("last-event-id");
      const afterSequence =
        lastEventId === null || lastEventId === ""
          ? readAfterCursor(context.url)
          : parseAfterCursor(lastEventId);
      return eventStreamResponse({
        app: context.app,
        stop: context.stop,
        request: context.request,
        runId: context.params[0] ?? "",
        afterSequence,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/events$/,
    handler: async ({ app, params, url }) =>
      jsonResponse(200, await listRunEvents(app, params[0] ?? "", readAfterCursor(url))),
  },
  {
    method: "POST",
    pattern: /^\/v1\/runs\/([^/]+)\/cancel$/,
    handler: async ({ app, params }) =>
      jsonResponse(200, { result: await cancelRun(app, params[0] ?? "") }),
  },
  {
    method: "POST",
    pattern: /^\/v1\/runs\/([^/]+)\/signal$/,
    handler: async ({ app, params, request }) => {
      const runId = params[0] ?? "";
      await requireRun(app, runId);
      const body = await readJsonBody(request);
      const name = typeof body.name === "string" ? body.name : "";
      return jsonResponse(200, { result: await signalRun(app, runId, name, body.value) });
    },
  },
];
