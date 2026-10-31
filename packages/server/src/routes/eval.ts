import { runEvals } from "@plico/runtime";
import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

export const evalRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/eval$/,
    handler: async ({ projectRoot, eventStore, response }) => {
      sendJson(response, 200, await runEvals(projectRoot, { eventStore }));
    },
  },
];
