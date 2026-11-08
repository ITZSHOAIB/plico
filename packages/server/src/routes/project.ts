import { composeInstructions } from "@plico/runtime";
import { loadProjectOrThrow } from "../project.js";
import { jsonResponse } from "../responses.js";
import type { Route } from "./types.js";

export const projectRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/project$/,
    handler: async ({ projectRoot }) => {
      const project = await loadProjectOrThrow(projectRoot);
      return jsonResponse(200, { project });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/instructions$/,
    handler: async ({ projectRoot }) => {
      const project = await loadProjectOrThrow(projectRoot);
      return jsonResponse(200, await composeInstructions(project));
    },
  },
];
