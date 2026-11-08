import { jsonResponse } from "../responses.js";
import type { Route } from "./types.js";

export const healthRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/health$/,
    handler: async ({ app }) =>
      jsonResponse(200, app.inspect ? { ok: true, inspection: true } : { ok: true }),
  },
];
