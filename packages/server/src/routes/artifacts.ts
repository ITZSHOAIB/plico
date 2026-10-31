import { buildArtifactWorkspace, readArtifactSnapshot } from "@plico/runtime";
import { HttpError } from "../errors.js";
import { sendJson } from "../responses.js";
import type { Route, RouteContext } from "./types.js";

async function readRunEvents({ eventStore }: RouteContext, runId: string) {
  const run = await eventStore.getRun(runId);
  if (!run) {
    throw new HttpError(404, "run.not_found", `Unknown run ID: ${runId}`);
  }

  return eventStore.getEvents(runId);
}

async function readWorkspace(context: RouteContext, runId: string) {
  const events = await readRunEvents(context, runId);
  const workspace = buildArtifactWorkspace(runId, events);
  if (!workspace) {
    throw new HttpError(404, "workspace.not_found", `No artifact workspace for run: ${runId}`);
  }

  return workspace;
}

export const artifactRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/workspace$/,
    handler: async (context) => {
      sendJson(context.response, 200, await readWorkspace(context, context.params[0] ?? ""));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/workspace\/files\/(.+)$/,
    handler: async (context) => {
      const [runId = "", path = ""] = context.params;
      const workspace = await readWorkspace(context, runId);
      const file = workspace.files.find((candidate) => candidate.path === path);
      if (!file) {
        throw new HttpError(404, "artifact.not_found", `Unknown artifact file: ${path}`);
      }

      sendJson(context.response, 200, file);
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/workspace\/snapshots\/([^/]+)$/,
    handler: async (context) => {
      const [runId = "", snapshotId = ""] = context.params;
      const snapshot = readArtifactSnapshot(await readRunEvents(context, runId), snapshotId);
      if (!snapshot) {
        throw new HttpError(404, "artifact.not_found", `Unknown artifact snapshot: ${snapshotId}`);
      }

      sendJson(context.response, 200, snapshot);
    },
  },
];
