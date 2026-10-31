import { checkReadiness } from "@plico/runtime";
import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

export const readinessRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/readiness$/,
    handler: async ({ projectRoot, eventStore, response }) => {
      sendJson(response, 200, await checkReadiness(projectRoot, { eventStore }));
    },
  },
];
