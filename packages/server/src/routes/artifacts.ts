import {
  buildArtifactWorkspace,
  type PlicoEvent,
  readArtifactSnapshot,
  readArtifactVersion,
} from "@plico/runtime";
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
    pattern: /^\/v1\/runs\/([^/]+)\/workspace\/diffs$/,
    handler: async (context) => {
      const [runId = ""] = context.params;
      const events = await readRunEvents(context, runId);
      const workspace = requireWorkspace(runId, events);
      const path = context.url.searchParams.get("path");
      if (!path) {
        throw new HttpError(400, "artifact.path_required", "A path is required to diff artifacts.");
      }
      if (!workspace.files.some((file) => file.path === path)) {
        throw new HttpError(404, "artifact.not_found", `Unknown artifact file: ${path}`);
      }
      const fromVersion = readVersionQuery(context.url, "fromVersion");
      const toVersion = readVersionQuery(context.url, "toVersion");
      const from = readArtifactVersion(events, path, fromVersion);
      const to = readArtifactVersion(events, path, toVersion);
      if (!from || !to) {
        throw new HttpError(
          404,
          "artifact.version_not_found",
          `Unknown artifact version for ${path}: ${!from ? fromVersion : toVersion}`,
        );
      }
      if (
        typeof from.content !== "string" ||
        typeof to.content !== "string" ||
        !isDiffableMimeType(from.mimeType) ||
        !isDiffableMimeType(to.mimeType)
      ) {
        throw new HttpError(
          415,
          "artifact.diff_unsupported_media_type",
          "Artifact diffs support text, JSON, and XML content.",
        );
      }
      if (
        Buffer.byteLength(from.content, "utf8") > maxDiffContentBytes ||
        Buffer.byteLength(to.content, "utf8") > maxDiffContentBytes
      ) {
        throw new HttpError(
          413,
          "artifact.diff_too_large",
          `Artifact versions must be at most ${maxDiffContentBytes} bytes to diff.`,
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
    pattern: /^\/v1\/runs\/([^/]+)\/workspace\/exports$/,
    handler: async (context) => {
      const [runId = ""] = context.params;
      const workspace = await readWorkspace(context, runId);
      const path = context.url.searchParams.get("path");
      if (!path) {
        throw new HttpError(
          400,
          "artifact.path_required",
          "A path is required to export an artifact.",
        );
      }
      const file = workspace.files.find((candidate) => candidate.path === path);
      if (!file) {
        throw new HttpError(404, "artifact.not_found", `Unknown artifact file: ${path}`);
      }

      const filename = path.split("/").at(-1) || "artifact";
      const encodedFilename = encodeURIComponent(filename).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      context.response.statusCode = 200;
      context.response.setHeader("x-content-type-options", "nosniff");
      context.response.setHeader("content-type", exportMediaType(file.mimeType));
      context.response.setHeader(
        "content-disposition",
        `attachment; filename*=UTF-8''${encodedFilename}`,
      );
      context.response.end(
        typeof file.content === "string" ? file.content : Buffer.from(file.content.data, "base64"),
      );
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

function exportMediaType(mimeType: string): string {
  const mediaType = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (
    mediaType === "text/html" ||
    mediaType === "application/xhtml+xml" ||
    mediaType === "image/svg+xml" ||
    /\/(?:x-)?(?:java|ecma)script$/.test(mediaType) ||
    /\+(?:java|ecma)script$/.test(mediaType)
  ) {
    return "application/octet-stream";
  }
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mediaType)
    ? mediaType
    : "application/octet-stream";
}

function readVersionQuery(url: URL, name: "fromVersion" | "toVersion"): number {
  const value = url.searchParams.get(name);
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, "artifact.invalid_version", `${name} must be a positive integer.`);
  }
  return Number(value);
}

const maxDiffContentBytes = 1024 * 1024;

function isDiffableMimeType(mimeType: string): boolean {
  const mediaType = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType.endsWith("+json") ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+xml")
  );
}
