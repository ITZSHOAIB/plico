import { inspectTools } from "@plico-ai/runtime";
import { loadProjectOrThrow } from "../project.js";
import { jsonResponse } from "../responses.js";
import type { Route } from "./types.js";

export const toolRoutes: Route[] = [
  {
    method: "GET",
    hostOnly: true,
    pattern: /^\/v1\/tools$/,
    handler: async ({ projectRoot }) =>
      jsonResponse(200, await inspectTools(await loadProjectOrThrow(projectRoot))),
  },
];
