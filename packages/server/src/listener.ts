import type { RequestListener } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createApi, type ListenerOptions } from "./api.js";
import { internalsOf } from "./app/assemble.js";
import type { Plico } from "./app/types.js";

export type { ListenerOptions } from "./api.js";

/** `createApi` for a Node server. It never replaces the global `Request` or `Response`. */
export function createRequestListener(
  plico: Plico,
  options: ListenerOptions = {},
): RequestListener {
  const api = createApi(internalsOf(plico), options);
  return getRequestListener((request) => api.fetch(request), { overrideGlobalObjects: false });
}
