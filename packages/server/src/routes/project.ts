import { composeInstructions } from "@plico/runtime";
import { loadProjectOrThrow } from "../project.js";
import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

export const projectRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/project$/,
    handler: async ({ projectRoot, response }) => {
      const project = await loadProjectOrThrow(projectRoot);
      sendJson(response, 200, { project });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/instructions$/,
    handler: async ({ projectRoot, response }) => {
      const project = await loadProjectOrThrow(projectRoot);
      sendJson(response, 200, await composeInstructions(project));
    },
  },
];
