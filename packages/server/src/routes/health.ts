import { jsonResponse } from "../responses.js";
import type { Route } from "./types.js";

export const healthRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/health$/,
    handler: async () => jsonResponse(200, { ok: true }),
  },
];
