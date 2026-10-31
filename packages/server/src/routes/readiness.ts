import { checkReadiness } from "@plico/runtime";
import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

export const readinessRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/readiness$/,
    handler: async ({ projectRoot, eventStore, studioPath, response }) => {
      const report = await checkReadiness(projectRoot, { eventStore, studioPath });
      sendJson(response, 200, report);
    },
  },
];
