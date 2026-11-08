import type { RequestListener } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { internalsOf } from "./app/assemble.js";
import type { Plico } from "./app/types.js";
import { errorResponse, HttpError } from "./errors.js";
import { assertTrustedRequest } from "./origin-guard.js";
import { handleRequest } from "./routes/index.js";
import { serveStaticFile } from "./serve-static.js";

/** The HTTP-only options. A library embedder never sets these. */
export interface ListenerOptions {
  studioPath?: string;
  /**
   * Skip the loopback `Host` check. Set it when the server is deliberately reachable under another
   * name, for example behind a host app's own authentication. Cross-origin requests stay refused.
   */
  allowRemote?: boolean;
  /**
   * The origin browsers use to reach this server, such as `https://plico.example` when TLS ends at
   * a proxy. A request `Origin` must match it exactly, scheme and port included. Without it, the
   * scheme of the connection and the `Host` header decide.
   */
  publicOrigin?: string;
  /**
   * Accept a `script` on `POST /v1/runs` and `POST /v1/runs/dry`. A script calls project tool
   * handlers with arguments the caller chooses and skips the model, so it is off by default.
   */
  allowScript?: boolean;
}

/** The `/v1` API, and Studio when `studioPath` is set, over one `Plico`, as a Hono app. */
export function createApi(plico: Plico, options: ListenerOptions = {}): Hono {
  const { deps, stop } = internalsOf(plico);
  const { studioPath } = options;
  const api = new Hono();

  api.use("*", async (context, next) => {
    try {
      assertTrustedRequest(context.req.raw, {
        allowRemote: options.allowRemote === true,
        publicOrigin: options.publicOrigin,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return errorResponse(error.status, error.code, error.message);
    }
    await next();
  });

  api.all("*", async (context) => {
    const request = context.req.raw;
    const url = new URL(request.url);
    const isApiPath = url.pathname === "/health" || url.pathname.startsWith("/v1/");
    const route = () =>
      handleRequest({
        app: deps,
        stop,
        studioPath,
        allowScript: options.allowScript === true,
        request,
      });

    if (isApiPath || !studioPath) return route();
    return (
      (await serveStaticFile(studioPath, url.pathname)) ??
      (await serveStaticFile(studioPath, "/index.html")) ??
      route()
    );
  });

  return api;
}

/** `createApi` for a Node server. It never replaces the global `Request` or `Response`. */
export function createRequestListener(
  plico: Plico,
  options: ListenerOptions = {},
): RequestListener {
  const api = createApi(plico, options);
  return getRequestListener((request) => api.fetch(request), { overrideGlobalObjects: false });
}
