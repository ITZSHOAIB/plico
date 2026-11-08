import { checkReadiness } from "@plico/runtime";
import { jsonResponse } from "../responses.js";
import type { Route } from "./types.js";

export const readinessRoutes: Route[] = [
  {
    method: "GET",
    hostOnly: true,
    pattern: /^\/v1\/readiness$/,
    handler: async ({ projectRoot, eventStore, threadStore, studioPath }) => {
      const report = await checkReadiness(projectRoot, {
        eventStore,
        ...(threadStore ? { threadStore } : {}),
        studioPath,
      });
      return jsonResponse(200, report);
    },
  },
];
