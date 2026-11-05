import { buildArtifactWorkspace, type PlicoEvent, readArtifactSnapshot } from "@plico/runtime";
import { createTwoFilesPatch } from "diff";
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

function requireWorkspace(runId: string, events: PlicoEvent[]) {
  const workspace = buildArtifactWorkspace(runId, events);
  if (!workspace) {
    throw new HttpError(404, "workspace.not_found", `No artifact workspace for run: ${runId}`);
  }

  return workspace;
}

async function readWorkspace(context: RouteContext, runId: string) {
  return requireWorkspace(runId, await readRunEvents(context, runId));
}

export const artifactRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/runs\/([^/]+)\/workspace\/files\/(.+)\/diff$/,
    handler: async (context) => {
      const [runId = "", path = ""] = context.params;
      const fromVersion = readVersionQuery(context.url, "fromVersion");
      const toVersion = readVersionQuery(context.url, "toVersion");
      const events = await readRunEvents(context, runId);
      const workspace = requireWorkspace(runId, events);
      if (!workspace.files.some((file) => file.path === path)) {
        throw new HttpError(404, "artifact.not_found", `Unknown artifact file: ${path}`);
      }
      const from = readArtifactVersion(events, path, fromVersion);
      const to = readArtifactVersion(events, path, toVersion);
      if (!from || !to) {
        throw new HttpError(
          404,
          "artifact.version_not_found",
          `Unknown artifact version for ${path}: ${!from ? fromVersion : toVersion}`,
        );
      }

      sendJson(context.response, 200, {
        path,
        fromVersion,
        toVersion,
        diff: createTwoFilesPatch(
          path,
          path,
          from.content,
          to.content,
          `version ${fromVersion}`,
          `version ${toVersion}`,
        ),
      });
    },
  },
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
      const events = await readRunEvents(context, runId);
      requireWorkspace(runId, events);
      const snapshot = readArtifactSnapshot(events, snapshotId);
      if (!snapshot) {
        throw new HttpError(404, "artifact.not_found", `Unknown artifact snapshot: ${snapshotId}`);
      }

      sendJson(context.response, 200, snapshot);
    },
  },
];

function readVersionQuery(url: URL, name: "fromVersion" | "toVersion"): number {
  const value = url.searchParams.get(name);
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, "artifact.invalid_version", `${name} must be a positive integer.`);
  }
  return Number(value);
}

function readArtifactVersion(
  events: PlicoEvent[],
  path: string,
  targetVersion: number,
): { content: string } | undefined {
  let currentVersion = 0;
  for (const event of events) {
    if (event.type !== "artifact.file.written" || event.payload.path !== path) continue;
    currentVersion = event.payload.version ?? currentVersion + 1;
    if (currentVersion === targetVersion) return { content: event.payload.content };
  }
  return undefined;
}
