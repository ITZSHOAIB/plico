import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

export const healthRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/health$/,
    handler: async ({ response }) => {
      sendJson(response, 200, { ok: true });
    },
  },
];
